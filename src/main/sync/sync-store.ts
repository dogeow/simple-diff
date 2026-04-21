import Store from 'electron-store'
import type { SourceConfig, SyncDirection, SyncItem, SyncTaskStatus } from '@shared/types'

export interface PersistedSyncTask {
  readonly id: string
  readonly leftSource: SourceConfig
  readonly rightSource: SourceConfig
  readonly direction: SyncDirection
  readonly status: SyncTaskStatus
  readonly pendingItems: readonly SyncItem[]
  readonly pendingDirs: readonly string[]
  readonly totalItems: number
  readonly completedItems: number
  readonly currentPath: string | null
  readonly lastCompletedPath: string | null
  readonly lastError: string | null
  readonly createdAt: number
  readonly updatedAt: number
}

interface SyncStoreSchema {
  task: PersistedSyncTask | null
}

const store = new Store<SyncStoreSchema>({
  name: 'sync-task',
  defaults: { task: null },
})

export function getSyncTask(): PersistedSyncTask | null {
  const task = store.get('task') as PersistedSyncTask | ({
    readonly items?: readonly SyncItem[]
    readonly currentIndex?: number
  } & Partial<PersistedSyncTask>) | null

  if (!task) return null

  if ('pendingItems' in task && Array.isArray(task.pendingItems)) {
    return task as PersistedSyncTask
  }

  if (Array.isArray(task.items)) {
    const remainingItems = task.items.slice(task.currentIndex ?? 0)
    const pendingDirs = remainingItems
      .filter((item) => item.kind === 'directory')
      .map((item) => item.relativePath)

    return {
      id: task.id ?? 'legacy-sync-task',
      leftSource: task.leftSource!,
      rightSource: task.rightSource!,
      direction: task.direction!,
      status: task.status ?? 'paused',
      pendingItems: remainingItems,
      pendingDirs,
      totalItems: task.items.length,
      completedItems: task.currentIndex ?? 0,
      currentPath: task.currentPath ?? null,
      lastCompletedPath: task.lastCompletedPath ?? null,
      lastError: task.lastError ?? null,
      createdAt: task.createdAt ?? Date.now(),
      updatedAt: task.updatedAt ?? Date.now(),
    }
  }

  return null
}

export function setSyncTask(task: PersistedSyncTask | null): void {
  store.set('task', task)
}
