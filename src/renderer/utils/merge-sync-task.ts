import type { SyncTaskSnapshot } from '../../../shared/types'

/** Progress events carry only changed items; full snapshots arrive at lifecycle boundaries. */
export function mergeSyncTask(previous: SyncTaskSnapshot | null, next: SyncTaskSnapshot | null): SyncTaskSnapshot | null {
  if (!next || !next.itemsDelta) return next
  if (!previous || previous.id !== next.id) return { ...next, itemsDelta: false }
  const updates = new Map((next.items ?? []).map((item) => [`${item.kind}:${item.relativePath}`, item]))
  const items = (previous.items ?? []).map((item) => {
    const key = `${item.kind}:${item.relativePath}`
    const updated = updates.get(key)
    updates.delete(key)
    return updated ?? item
  })
  return { ...next, itemsDelta: false, items: [...items, ...updates.values()] }
}
