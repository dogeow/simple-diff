import { expect, it } from 'vitest'
import type { SyncTaskSnapshot } from '../../../shared/types'
import { mergeSyncTask } from './merge-sync-task'

const task: SyncTaskSnapshot = {
  id: 'task', leftSource: { type: 'local', path: '/left' }, rightSource: { type: 'local', path: '/right' },
  direction: 'left_to_right', status: 'running', totalItems: 3, completedItems: 0, currentPath: null,
  lastCompletedPath: null, lastError: null, createdAt: 1, updatedAt: 1,
  items: ['a', 'b', 'c'].map((relativePath) => ({ relativePath, kind: 'file', status: 'pending' })),
}
it('merges batched out-of-order item updates without dropping untouched queue entries', () => {
  const next = mergeSyncTask(task, { ...task, itemsDelta: true, completedItems: 1,
    items: [{ relativePath: 'b', kind: 'file', status: 'completed' }, { relativePath: 'c', kind: 'file', status: 'running' }] })!
  expect(next.items?.map((item) => item.status)).toEqual(['pending', 'completed', 'running'])
  expect(next.items?.[0]).toBe(task.items?.[0])
  expect(next.itemsDelta).toBe(false)
})
it('does not mix entries belonging to different tasks and respects a clear event', () => {
  expect(mergeSyncTask(task, { ...task, id: 'new', itemsDelta: true, items: [] })?.items).toEqual([])
  expect(mergeSyncTask(task, null)).toBeNull()
})
