import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { CompareHistoryEntry, CompareResult, SourceConfig } from '@shared/types'

interface StoreSchema {
  history: CompareHistoryEntry[]
}

const store = new Store<StoreSchema>({
  name: 'compare-history',
  defaults: { history: [] },
})

function sourceLabel(config: SourceConfig): string {
  if (config.type === 'local') return config.path
  return `sftp://${config.configId}:${config.path}`
}

export function addHistory(result: CompareResult): CompareHistoryEntry {
  const entry: CompareHistoryEntry = {
    id: randomUUID(),
    timestamp: Date.now(),
    leftLabel: sourceLabel(result.leftSource),
    rightLabel: sourceLabel(result.rightSource),
    leftSource: result.leftSource,
    rightSource: result.rightSource,
    stats: result.stats,
  }

  const history = store.get('history') ?? []
  store.set('history', [entry, ...history].slice(0, 50)) // keep last 50
  return entry
}

export function listHistory(): CompareHistoryEntry[] {
  return store.get('history') ?? []
}

export function clearHistory(): void {
  store.set('history', [])
}

export function deleteHistory(id: string): void {
  const history = store.get('history') ?? []
  store.set(
    'history',
    history.filter((h) => h.id !== id),
  )
}
