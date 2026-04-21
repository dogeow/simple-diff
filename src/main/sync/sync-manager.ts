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

type Listener = (task: SyncTaskSnapshot | null) => void

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

  constructor() {
    if (this.task?.status === 'running') {
      this.task = {
        ...this.task,
        status: 'paused',
        lastError: null,
        updatedAt: now(),
      }
      setSyncTask(this.task)
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

    this.task = {
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
    this.persistAndNotify()

    logger.info(`开始同步: ${request.direction === 'left_to_right' ? '左 -> 右' : '右 -> 左'}`)

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
      this.persistAndNotify()
    }
    return this.getSnapshot()
  }

  async resume(): Promise<SyncTaskSnapshot | null> {
    if (!this.task) return null
    if (this.task.status === 'completed') return this.getSnapshot()

    this.task = {
      ...this.task,
      status: 'running',
      lastError: null,
      updatedAt: now(),
    }
    this.persistAndNotify()
    this.ensureLoop()
    return this.getSnapshot()
  }

  clear(): void {
    if (this.task?.status === 'running') {
      throw new Error('同步进行中，无法清除任务')
    }
    this.task = null
    this.persistAndNotify()
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

    try {
      while (this.task && this.task.status === 'running') {
        const currentTask = this.task

        if (currentTask.pendingItems.length > 0) {
          const [item, ...remainingItems] = currentTask.pendingItems
          this.task = {
            ...currentTask,
            pendingItems: remainingItems,
            currentPath: item.relativePath,
            updatedAt: now(),
          }
          this.persistAndNotify()

          await this.executeItem(item, source, target, sourceFileSource, targetFileSource)

          const nextTask = this.task
          if (!nextTask) break
          this.task = {
            ...nextTask,
            completedItems: nextTask.completedItems + 1,
            currentPath: null,
            lastCompletedPath: item.relativePath,
            updatedAt: now(),
          }
          this.persistAndNotify()
          continue
        }

        if (currentTask.pendingDirs.length > 0) {
          const [dirPath, ...remainingDirs] = currentTask.pendingDirs
          this.task = {
            ...currentTask,
            pendingDirs: remainingDirs,
            currentPath: dirPath,
            updatedAt: now(),
          }
          this.persistAndNotify()

          await this.expandDirectory(dirPath, source, sourceFileSource)
          continue
        }

        break
      }

      if (this.task && this.task.pendingItems.length === 0 && this.task.pendingDirs.length === 0) {
        this.task = {
          ...this.task,
          status: 'completed',
          currentPath: null,
          updatedAt: now(),
        }
        logger.info('同步完成')
        this.persistAndNotify()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '同步失败'
      logger.error(`同步失败: ${message}`)
      if (this.task) {
        this.task = {
          ...this.task,
          status: 'failed',
          currentPath: null,
          lastError: message,
          updatedAt: now(),
        }
        this.persistAndNotify()
      }
    } finally {
      await sourceFileSource.dispose()
      await targetFileSource.dispose()
    }
  }

  private async expandDirectory(
    dirPath: string,
    source: SourceConfig,
    sourceFileSource: Awaited<ReturnType<typeof createFileSource>>,
  ): Promise<void> {
    logger.info(`正在扫描同步目录: ${dirPath}`)
    const fullPath = joinSourcePath(source, source.path, dirPath)
    const children = await sourceFileSource.list(fullPath)
    const expanded = expandDirectoryEntries(
      dirPath,
      children.map((child) => ({ name: child.name, isDirectory: child.isDirectory })),
      source.type,
    )

    const task = this.task
    if (!task) return

    this.task = {
      ...task,
      pendingItems: [...expanded.pendingItems, ...task.pendingItems],
      pendingDirs: [...expanded.pendingDirs, ...task.pendingDirs.filter((pendingDir) => pendingDir !== dirPath)],
      totalItems: task.totalItems + expanded.totalItems,
      currentPath: null,
      updatedAt: now(),
    }
    this.persistAndNotify()
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
      logger.info(`同步目录: ${item.relativePath}`)
      await this.expandDirectory(item.relativePath, source, sourceFileSource)
      return
    }

    await targetFileSource.ensureDir(getParentDir(target, targetPath))
    const content = await sourceFileSource.readFileBuffer(sourcePath)
    await targetFileSource.writeFileBuffer(targetPath, content)
    logger.info(`同步文件: ${item.relativePath}`)
  }

  private persistAndNotify(): void {
    setSyncTask(this.task)
    const snapshot = this.task ? toSnapshot(this.task) : null
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}

function getParentDir(target: SourceConfig, fullPath: string): string {
  return target.type === 'sftp' ? posix.dirname(fullPath) : dirname(fullPath)
}

export const syncManager = new SyncManager()
