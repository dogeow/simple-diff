import type { CompareEntry } from '../../../shared/types'
import { useAppStore } from '../stores/app-store'
import { applyEntryUpdateToSnapshot, applyScanEntriesToSnapshot, useCompareStore } from '../stores/compare-store'
import { addRendererLog } from '../stores/log-store'

interface CompareEventAPI {
  onScanComplete: (callback: (compareId: string, entries: readonly CompareEntry[]) => void) => (() => void)
  onEntryUpdate: (callback: (compareId: string, entry: CompareEntry) => void) => (() => void)
}

export function bindCompareEvents(api: CompareEventAPI): () => void {
  const entryUpdateCountByCompareId = new Map<string, number>()

  addRendererLog('compare', 'info', 'compare 事件监听已绑定')

  const unsubscribeScan = api.onScanComplete((compareId, entries) => {
    const activeCompareId = useCompareStore.getState().activeCompareId
    addRendererLog(
      'compare',
      'info',
      `收到扫描批次 compareId=${compareId} active=${activeCompareId ?? '-'} entries=${entries.length}`,
    )

    useCompareStore.getState().setScanEntries(compareId, entries)
    useAppStore.getState().updateCompareTabSnapshotByCompareId(compareId, (snapshot) =>
      applyScanEntriesToSnapshot(snapshot, compareId, entries),
    )
  })

  const unsubscribeEntry = api.onEntryUpdate((compareId, entry) => {
    const nextCount = (entryUpdateCountByCompareId.get(compareId) ?? 0) + 1
    entryUpdateCountByCompareId.set(compareId, nextCount)

    if (nextCount <= 10 || nextCount % 200 === 0) {
      const activeCompareId = useCompareStore.getState().activeCompareId
      addRendererLog(
        'compare',
        'info',
        `收到条目更新 compareId=${compareId} active=${activeCompareId ?? '-'} path=${entry.relativePath || '.'} state=${entry.state} seq=${nextCount}`,
      )
    }

    useCompareStore.getState().updateEntry(compareId, entry)
    useAppStore.getState().updateCompareTabSnapshotByCompareId(compareId, (snapshot) =>
      applyEntryUpdateToSnapshot(snapshot, compareId, entry),
    )
  })

  return () => {
    addRendererLog('compare', 'info', 'compare 事件监听已解绑')
    unsubscribeScan()
    unsubscribeEntry()
  }
}