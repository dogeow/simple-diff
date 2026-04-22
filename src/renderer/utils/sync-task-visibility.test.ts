import { describe, expect, it } from 'vitest'
import type { SourceConfig, SyncTaskSnapshot } from '../../../shared/types'
import { shouldShowSyncTaskInCompare } from './sync-task-visibility'

function createSyncTask(
  leftSource: SourceConfig,
  rightSource: SourceConfig,
): SyncTaskSnapshot {
  return {
    id: 'sync-1',
    leftSource,
    rightSource,
    direction: 'left_to_right',
    status: 'running',
    totalItems: 10,
    completedItems: 4,
    currentPath: 'src/index.ts',
    lastCompletedPath: 'src/app.ts',
    lastError: null,
    createdAt: 1,
    updatedAt: 2,
  }
}

describe('shouldShowSyncTaskInCompare', () => {
  it('shows the sync task when no current compare sources are active yet', () => {
    const syncTask = createSyncTask(
      { type: 'local', path: '/var/www/dogeow-api' },
      { type: 'local', path: '/var/www/dogeow-api-next' },
    )

    expect(shouldShowSyncTaskInCompare(syncTask, null, null)).toBe(true)
  })

  it('shows the sync task when it belongs to the current compare sources', () => {
    const leftSource = { type: 'sftp', configId: 'server-a', path: '/srv/current' } as const
    const rightSource = { type: 'local', path: '/tmp/current' } as const
    const syncTask = createSyncTask(leftSource, rightSource)

    expect(shouldShowSyncTaskInCompare(syncTask, leftSource, rightSource)).toBe(true)
  })

  it('hides the sync task when the current compare uses different sources', () => {
    const syncTask = createSyncTask(
      { type: 'local', path: '/var/www/dogeow-api' },
      { type: 'sftp', configId: 'server-a', path: '/var/www/dogeow-api-next' },
    )

    expect(shouldShowSyncTaskInCompare(
      syncTask,
      { type: 'local', path: '/var/www/another-project' },
      { type: 'sftp', configId: 'server-b', path: '/var/www/dogeow-api-next' },
    )).toBe(false)
  })

  it('treats equivalent paths with trailing separators as the same source', () => {
    const syncTask = createSyncTask(
      { type: 'local', path: '/var/www/dogeow-api/' },
      { type: 'sftp', configId: 'server-a', path: '/var/www/dogeow-api-next///' },
    )

    expect(shouldShowSyncTaskInCompare(
      syncTask,
      { type: 'local', path: '/var/www/dogeow-api' },
      { type: 'sftp', configId: 'server-a', path: '/var/www/dogeow-api-next' },
    )).toBe(true)
  })
})