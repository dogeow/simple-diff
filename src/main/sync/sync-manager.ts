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

function toSnapshot(task: PersistedSyncTask): SyncTaskSnapshot {
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
    return this.task ? toSnapshot(this.task) : null
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async start(request: StartSyncRequest): Promise<SyncTaskSnapshot> {
    if (this.task?.status === 'running') {
      throw new Error('已有同步任务正在运行')
    }

    const seeded = seedSyncQueues(request.entries, request.direction)
    const timestamp = now()

    const nextTask: PersistedSyncTask = {
      id: randomUUID(),
      leftSource: request.leftSource,
      rightSource: request.rightSource,
      direction: request.direction,
      status: seeded.totalItems === 0 && seeded.pendingDirs.length === 0 ? 'completed' : 'running',
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

    return toSnapshot(this.task)
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

    const snapshot = this.task ? toSnapshot(this.task) : null
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
