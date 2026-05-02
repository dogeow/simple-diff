import { randomUUID } from 'crypto'
import { dirname } from 'path'
import { posix } from 'path'
import { createFileSource } from '../file-source'
import { logger } from '../utils/logger'
import { joinSourcePath } from '@shared/source-path'
import type {
  SourceConfig,
  StartSyncRequest,
  SyncDirection,
  SyncItem,
  SyncTaskItemSnapshot,
  SyncTaskSnapshot,
} from '@shared/types'
import { expandDirectoryEntries, seedSyncQueues } from './plan'
import { getSyncTask, setSyncTask, type PersistedSyncTask } from './sync-store'

const syncLogger = logger.child('sync')

type Listener = (task: SyncTaskSnapshot | null) => void

const SYNC_PROGRESS_NOTIFY_INTERVAL_MS = 250
const SYNC_TASK_PERSIST_INTERVAL_MS = 5000
const SYNC_LOG_INTERVAL_MS = 2000

function now(): number {
  return Date.now()
}

function statusForItem(
  index: number,
  item: SyncItem,
  task: Pick<PersistedSyncTask, 'completedItems' | 'status' | 'currentPath'>,
): SyncTaskItemSnapshot['status'] {
  if (index < task.completedItems) return 'completed'
  if (task.status === 'running' && task.currentPath === item.relativePath) return 'running'
  return 'pending'
}

function toSnapshot(task: PersistedSyncTask, items: readonly SyncTaskItemSnapshot[]): SyncTaskSnapshot {
  return {
    id: task.id,
    leftSource: task.leftSource,
    rightSource: task.rightSource,
    direction: task.direction,
    status: task.status,
    totalItems: task.totalItems,
    completedItems: task.completedItems,
    currentPath: task.currentPath,
    lastCompletedPath: task.lastCompletedPath,
    lastError: task.lastError,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    items,
  }
}

function sourceRootForDirection(direction: SyncDirection, left: SourceConfig, right: SourceConfig): {
  source: SourceConfig
  target: SourceConfig
} {
  return direction === 'left_to_right'
    ? { source: left, target: right }
    : { source: right, target: left }
}

function isSameSourceConfig(left: SourceConfig, right: SourceConfig): boolean {
  if (left.type !== right.type) {
    return false
  }

  if (left.path !== right.path) {
    return false
  }

  return left.type !== 'sftp' || left.configId === right.configId
}

function canAppendToTask(task: PersistedSyncTask, request: StartSyncRequest): boolean {
  return task.status === 'running'
    && task.direction === request.direction
    && isSameSourceConfig(task.leftSource, request.leftSource)
    && isSameSourceConfig(task.rightSource, request.rightSource)
}

function syncItemKey(item: SyncItem): string {
  return `${item.kind}:${item.relativePath}`
}

export class SyncManager {
  private task = getSyncTask()
  private listeners = new Set<Listener>()
  private loopPromise: Promise<void> | null = null
  private activeSyncQueue: readonly SyncItem[] | null = null
  private activeSyncIndex = 0
  private progressTimer: ReturnType<typeof setTimeout> | null = null
  private progressDirty = false
  private lastProgressNotifyAt = 0
  private lastTaskPersistAt = 0
  private lastProgressLogAt = 0

  // Cached SyncTaskItemSnapshot[] for the current allItems reference. Mutated in
  // place across ticks so we don't reallocate N item objects every 250ms.
  private snapshotItemsCache: SyncTaskItemSnapshot[] | null = null
  private snapshotItemsAllItemsRef: readonly SyncItem[] | null = null
  private snapshotItemsLookup: Map<string, number> | null = null
  private snapshotItemsCompleted = 0
  private snapshotItemsCurrentPath: string | null = null
  private snapshotItemsStatus: PersistedSyncTask['status'] | null = null

  constructor() {
    if (this.task?.status === 'running') {
      this.task = {
        ...this.task,
        status: 'paused',
        lastError: null,
        updatedAt: now(),
      }
      setSyncTask(this.task)
      this.lastTaskPersistAt = now()
    }
  }

  getSnapshot(): SyncTaskSnapshot | null {
    return this.task ? this.snapshot(this.task) : null
  }

  private snapshot(task: PersistedSyncTask): SyncTaskSnapshot {
    return toSnapshot(task, this.getCachedItemSnapshots(task))
  }

  private invalidateItemSnapshotCache(): void {
    this.snapshotItemsCache = null
    this.snapshotItemsAllItemsRef = null
    this.snapshotItemsLookup = null
  }

  private getCachedItemSnapshots(task: PersistedSyncTask): readonly SyncTaskItemSnapshot[] {
    const allItems = task.allItems ?? task.pendingItems

    // Full rebuild when the underlying items reference changed (or first call).
    if (this.snapshotItemsAllItemsRef !== allItems || this.snapshotItemsCache == null) {
      const lookup = new Map<string, number>()
      const cache: SyncTaskItemSnapshot[] = new Array(allItems.length)
      for (let i = 0; i < allItems.length; i += 1) {
        const item = allItems[i]
        lookup.set(item.relativePath, i)
        cache[i] = {
          relativePath: item.relativePath,
          kind: item.kind,
          status: statusForItem(i, item, task),
        }
      }
      this.snapshotItemsCache = cache
      this.snapshotItemsAllItemsRef = allItems
      this.snapshotItemsLookup = lookup
      this.snapshotItemsCompleted = task.completedItems
      this.snapshotItemsCurrentPath = task.currentPath
      this.snapshotItemsStatus = task.status
      return cache
    }

    const cache = this.snapshotItemsCache
    const lookup = this.snapshotItemsLookup!
    // allItems may be shorter than task.completedItems when hydration expands work
    // beyond the originally-seeded items list (see mergeHydratedTask). Clamp loop
    // bounds to cache.length so we don't read past it.
    const cacheLength = cache.length
    const prevCompletedClamped = Math.min(this.snapshotItemsCompleted, cacheLength)
    const newCompletedClamped = Math.min(task.completedItems, cacheLength)

    // Newly completed slots → mark 'completed'. Resume rewind → reset to 'pending'.
    if (newCompletedClamped > prevCompletedClamped) {
      for (let i = prevCompletedClamped; i < newCompletedClamped; i += 1) {
        const slot = cache[i]
        if (slot.status !== 'completed') {
          cache[i] = { ...slot, status: 'completed' }
        }
      }
    } else if (newCompletedClamped < prevCompletedClamped) {
      for (let i = newCompletedClamped; i < prevCompletedClamped; i += 1) {
        const slot = cache[i]
        if (slot.status !== 'pending') {
          cache[i] = { ...slot, status: 'pending' }
        }
      }
    }

    const prevCurrent = this.snapshotItemsCurrentPath
    const newCurrent = task.currentPath
    const prevRunning = this.snapshotItemsStatus === 'running'
    const newRunning = task.status === 'running'

    if (prevCurrent !== newCurrent || prevRunning !== newRunning) {
      // Reset old running slot back to its base status.
      if (prevCurrent != null && prevRunning) {
        const idx = lookup.get(prevCurrent)
        if (idx != null && idx >= newCompletedClamped && idx < cacheLength) {
          const slot = cache[idx]
          if (slot.status === 'running') {
            cache[idx] = { ...slot, status: 'pending' }
          }
        }
      }
      // Mark new running slot.
      if (newCurrent != null && newRunning) {
        const idx = lookup.get(newCurrent)
        if (idx != null && idx >= newCompletedClamped && idx < cacheLength) {
          const slot = cache[idx]
          if (slot.status !== 'running') {
            cache[idx] = { ...slot, status: 'running' }
          }
        }
      }
    }

    this.snapshotItemsCompleted = newCompleted
    this.snapshotItemsCurrentPath = newCurrent
    this.snapshotItemsStatus = task.status
    return cache
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async start(request: StartSyncRequest): Promise<SyncTaskSnapshot> {
    if (this.task?.status === 'running') {
      if (!canAppendToTask(this.task, request)) {
        throw new Error('已有同步任务正在运行')
      }

      return this.appendToRunningTask(request)
    }

    const seeded = seedSyncQueues(request.entries, request.direction)
    const timestamp = now()

    const nextTask: PersistedSyncTask = {
      id: randomUUID(),
      leftSource: request.leftSource,
      rightSource: request.rightSource,
      direction: request.direction,
      status: seeded.totalItems === 0 && seeded.pendingDirs.length === 0 ? 'completed' : 'running',
      allItems: seeded.pendingItems,
      pendingItems: seeded.pendingItems,
      pendingDirs: seeded.pendingDirs,
      totalItems: seeded.totalItems,
      completedItems: 0,
      currentPath: null,
      lastCompletedPath: null,
      lastError: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    this.task = nextTask
    this.commitTaskChange()

    if (nextTask.status === 'running') {
      try {
        const hydratedTask = await this.hydrateTaskItems(nextTask)
        this.task = this.mergeHydratedTask(nextTask.id, hydratedTask)
      } catch (error) {
        this.failTaskHydration(error)
        throw error
      }
      this.commitTaskChange()
    }

    syncLogger.info(`开始同步: ${request.direction === 'left_to_right' ? '左 -> 右' : '右 -> 左'}`)

    if (this.task.status === 'running') {
      this.ensureLoop()
    }

    return this.snapshot(this.task)
  }

  private async appendToRunningTask(request: StartSyncRequest): Promise<SyncTaskSnapshot> {
    if (!this.task) {
      throw new Error('没有可追加的同步任务')
    }

    const seeded = seedSyncQueues(request.entries, request.direction)
    if (seeded.pendingItems.length === 0) {
      return this.snapshot(this.task)
    }

    const incomingTask: PersistedSyncTask = {
      id: this.task.id,
      leftSource: request.leftSource,
      rightSource: request.rightSource,
      direction: request.direction,
      status: 'running',
      pendingItems: seeded.pendingItems,
      pendingDirs: seeded.pendingDirs,
      totalItems: seeded.totalItems,
      completedItems: 0,
      currentPath: null,
      lastCompletedPath: null,
      lastError: null,
      createdAt: this.task.createdAt,
      updatedAt: now(),
    }

    const hydratedIncomingTask = await this.hydrateTaskItems(incomingTask)
    // Build the dedup set without copying the active queue tail (was: activeSyncQueue.slice(...).map(syncItemKey)).
    const existingItemKeys = new Set<string>()
    if (this.activeSyncQueue) {
      for (let i = this.activeSyncIndex; i < this.activeSyncQueue.length; i += 1) {
        existingItemKeys.add(syncItemKey(this.activeSyncQueue[i]))
      }
    } else {
      for (const item of this.task.pendingItems) {
        existingItemKeys.add(syncItemKey(item))
      }
    }
    const appendedItems = hydratedIncomingTask.pendingItems.filter((item) => !existingItemKeys.has(syncItemKey(item)))

    if (appendedItems.length === 0) {
      return this.snapshot(this.task)
    }

    if (this.activeSyncQueue) {
      this.activeSyncQueue = [...this.activeSyncQueue, ...appendedItems]
    }

    const remainingItems = this.activeSyncQueue
      ? this.activeSyncQueue.slice(this.activeSyncIndex)
      : this.task.pendingItems
    this.task = {
      ...this.task,
      allItems: [...(this.task.allItems ?? remainingItems), ...appendedItems],
      pendingItems: remainingItems,
      pendingDirs: [],
      totalItems: this.task.totalItems + appendedItems.length,
      updatedAt: now(),
    }
    this.commitTaskChange()
    this.ensureLoop()
    syncLogger.info(`追加同步项: ${appendedItems.length} 项`)
    return this.snapshot(this.task)
  }

  async pause(): Promise<SyncTaskSnapshot | null> {
    if (!this.task) return null
    if (this.task.status === 'running') {
      this.task = {
        ...this.task,
        status: 'paused',
        currentPath: null,
        updatedAt: now(),
      }
      this.commitTaskChange()
    }
    return this.getSnapshot()
  }

  async resume(): Promise<SyncTaskSnapshot | null> {
    if (!this.task) return null
    if (this.task.status === 'completed') return this.getSnapshot()
    if (this.task.status === 'running') return this.getSnapshot()

    const nextTask: PersistedSyncTask = {
      ...this.task,
      status: 'running',
      lastError: null,
      updatedAt: now(),
    }
    this.task = nextTask
    this.commitTaskChange()

    try {
      const hydratedTask = await this.hydrateTaskItems(nextTask)
      this.task = this.mergeHydratedTask(nextTask.id, hydratedTask)
    } catch (error) {
      this.failTaskHydration(error)
      throw error
    }
    this.commitTaskChange()
    this.ensureLoop()
    return this.getSnapshot()
  }

  clear(): void {
    if (this.task?.status === 'running') {
      throw new Error('同步进行中，无法清除任务')
    }
    this.task = null
    this.invalidateItemSnapshotCache()
    this.commitTaskChange()
  }

  private ensureLoop(): void {
    if (this.loopPromise) return
    this.loopPromise = this.runLoop().finally(() => {
      this.loopPromise = null
    })
  }

  private async runLoop(): Promise<void> {
    const task = this.task
    if (!task || task.status !== 'running') return

    const { source, target } = sourceRootForDirection(task.direction, task.leftSource, task.rightSource)
    const sourceFileSource = await createFileSource(source)
    const targetFileSource = await createFileSource(target)
    this.activeSyncQueue = task.pendingItems
    this.activeSyncIndex = 0

    try {
      while (this.task && this.task.status === 'running') {
        const currentTask = this.task
        const item = this.activeSyncQueue[this.activeSyncIndex]

        if (item) {
          this.task = {
            ...currentTask,
            currentPath: item.relativePath,
            updatedAt: now(),
          }
          this.publishProgress()

          await this.executeItem(item, source, target, sourceFileSource, targetFileSource)

          const nextTask = this.task
          if (!nextTask) break
          this.activeSyncIndex += 1
          this.task = {
            ...nextTask,
            completedItems: nextTask.completedItems + 1,
            currentPath: null,
            lastCompletedPath: item.relativePath,
            updatedAt: now(),
          }
          this.maybeLogSyncProgress(item)
          if (this.task.status === 'running') {
            this.publishProgress()
          } else {
            this.commitTaskChange()
          }
          continue
        }

        break
      }

      const queueDrained = !this.activeSyncQueue || this.activeSyncIndex >= this.activeSyncQueue.length
      if (this.task && queueDrained && this.task.pendingDirs.length === 0) {
        this.task = {
          ...this.task,
          status: 'completed',
          pendingItems: [],
          currentPath: null,
          updatedAt: now(),
        }
        syncLogger.info('同步完成')
        this.commitTaskChange()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '同步失败'
      syncLogger.error(`同步失败: ${message}`)
      if (this.task) {
        this.task = {
          ...this.task,
          status: 'failed',
          currentPath: null,
          lastError: message,
          updatedAt: now(),
        }
        this.commitTaskChange()
      }
    } finally {
      await sourceFileSource.dispose()
      await targetFileSource.dispose()
      this.activeSyncQueue = null
      this.activeSyncIndex = 0
    }
  }

  private async hydrateTaskItems(task: PersistedSyncTask): Promise<PersistedSyncTask> {
    if (task.pendingDirs.length === 0) return task

    const { source } = sourceRootForDirection(task.direction, task.leftSource, task.rightSource)
    const sourceFileSource = await createFileSource(source)

    try {
      const pendingItems = await this.collectPendingItems(task.pendingItems, source, sourceFileSource)

      return {
        ...task,
        allItems: pendingItems,
        pendingItems,
        pendingDirs: [],
        totalItems: task.completedItems + pendingItems.length,
        updatedAt: now(),
      }
    } finally {
      await sourceFileSource.dispose()
    }
  }

  private async collectPendingItems(
    items: readonly SyncItem[],
    source: SourceConfig,
    sourceFileSource: Awaited<ReturnType<typeof createFileSource>>,
  ): Promise<readonly SyncItem[]> {
    const collected: SyncItem[] = []

    for (const item of items) {
      collected.push(item)

      if (item.kind !== 'directory') continue

      this.maybeLogHydrationProgress(item.relativePath)
      const fullPath = joinSourcePath(source, source.path, item.relativePath)
      const children = await sourceFileSource.list(fullPath)
      const expanded = expandDirectoryEntries(
        item.relativePath,
        children.map((child) => ({ name: child.name, isDirectory: child.isDirectory })),
        source.type,
      )
      const nestedItems = await this.collectPendingItems(expanded.pendingItems, source, sourceFileSource)
      collected.push(...nestedItems)
    }

    return collected
  }

  private failTaskHydration(error: unknown): void {
    if (!this.task) return

    const message = error instanceof Error ? error.message : '同步失败'
    syncLogger.error(`同步预处理失败: ${message}`)
    this.task = {
      ...this.task,
      status: this.task.status === 'paused' ? 'paused' : 'failed',
      currentPath: null,
      lastError: message,
      updatedAt: now(),
    }
    this.commitTaskChange()
  }

  private mergeHydratedTask(taskId: string, hydratedTask: PersistedSyncTask): PersistedSyncTask {
    if (!this.task || this.task.id !== taskId) {
      return hydratedTask
    }

    return {
      ...this.task,
      allItems: this.task.allItems ?? hydratedTask.allItems ?? hydratedTask.pendingItems,
      pendingItems: hydratedTask.pendingItems,
      pendingDirs: hydratedTask.pendingDirs,
      totalItems: hydratedTask.totalItems,
      updatedAt: hydratedTask.updatedAt,
    }
  }

  private async executeItem(
    item: SyncItem,
    source: SourceConfig,
    target: SourceConfig,
    sourceFileSource: Awaited<ReturnType<typeof createFileSource>>,
    targetFileSource: Awaited<ReturnType<typeof createFileSource>>,
  ): Promise<void> {
    const sourcePath = joinSourcePath(source, source.path, item.relativePath)
    const targetPath = joinSourcePath(target, target.path, item.relativePath)

    if (item.kind === 'directory') {
      await targetFileSource.ensureDir(targetPath)
      return
    }

    await targetFileSource.ensureDir(getParentDir(target, targetPath))
    const content = await sourceFileSource.readFileBuffer(sourcePath)
    await targetFileSource.writeFileBuffer(targetPath, content)
  }

  private maybeLogHydrationProgress(relativePath: string): void {
    const timestamp = now()
    if (timestamp - this.lastProgressLogAt < SYNC_LOG_INTERVAL_MS) return

    this.lastProgressLogAt = timestamp
    syncLogger.info(`正在预计算同步目录: ${relativePath}`)
  }

  private maybeLogSyncProgress(item: SyncItem): void {
    if (!this.task) return

    const timestamp = now()
    const isComplete = this.task.completedItems >= this.task.totalItems
    if (!isComplete && timestamp - this.lastProgressLogAt < SYNC_LOG_INTERVAL_MS) return

    this.lastProgressLogAt = timestamp
    const itemLabel = item.kind === 'directory' ? '目录' : '文件'
    syncLogger.info(`同步进度: ${this.task.completedItems}/${this.task.totalItems}，最近完成${itemLabel}: ${item.relativePath}`)
  }

  private getPersistableTask(): PersistedSyncTask | null {
    if (!this.task) return null
    if (!this.activeSyncQueue) return this.task

    return {
      ...this.task,
      pendingItems: this.activeSyncQueue.slice(this.activeSyncIndex),
    }
  }

  private commitTaskChange(): void {
    this.flushProgress({ persist: true, notify: true, clearTimer: true })
  }

  private publishProgress(): void {
    this.progressDirty = true

    const timestamp = now()
    const notifyDelay = SYNC_PROGRESS_NOTIFY_INTERVAL_MS - (timestamp - this.lastProgressNotifyAt)
    if (notifyDelay <= 0) {
      this.flushProgress({
        persist: timestamp - this.lastTaskPersistAt >= SYNC_TASK_PERSIST_INTERVAL_MS,
        notify: true,
        clearTimer: true,
      })
      return
    }

    if (this.progressTimer) return

    this.progressTimer = setTimeout(() => {
      this.progressTimer = null
      if (!this.progressDirty) return

      const nextTimestamp = now()
      this.flushProgress({
        persist: nextTimestamp - this.lastTaskPersistAt >= SYNC_TASK_PERSIST_INTERVAL_MS,
        notify: true,
        clearTimer: false,
      })
    }, notifyDelay)
  }

  private flushProgress(options: {
    readonly persist: boolean
    readonly notify: boolean
    readonly clearTimer: boolean
  }): void {
    if (options.clearTimer && this.progressTimer) {
      clearTimeout(this.progressTimer)
      this.progressTimer = null
    }

    const timestamp = now()
    if (options.persist) {
      this.task = this.getPersistableTask()
      setSyncTask(this.task)
      this.lastTaskPersistAt = timestamp
    }

    if (!options.notify) return

    const snapshot = this.task ? this.snapshot(this.task) : null
    for (const listener of this.listeners) {
      listener(snapshot)
    }
    this.lastProgressNotifyAt = timestamp
    this.progressDirty = false
  }
}

function getParentDir(target: SourceConfig, fullPath: string): string {
  return target.type === 'sftp' ? posix.dirname(fullPath) : dirname(fullPath)
}

export const syncManager = new SyncManager()
