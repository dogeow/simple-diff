import type { CompareEntry } from '../../../shared/types'
import { useAppStore } from '../stores/app-store'
import { applyEntryUpdateToSnapshot, applyScanEntriesToSnapshot, useCompareStore } from '../stores/compare-store'

interface CompareEventAPI {
  onScanComplete: (callback: (compareId: string, entries: readonly CompareEntry[]) => void) => (() => void)
  onEntryUpdate: (callback: (compareId: string, entry: CompareEntry) => void) => (() => void)
}

export function bindCompareEvents(api: CompareEventAPI): () => void {
  const unsubscribeScan = api.onScanComplete((compareId, entries) => {
    useCompareStore.getState().setScanEntries(compareId, entries)
    useAppStore.getState().updateCompareTabSnapshotByCompareId(compareId, (snapshot) =>
      applyScanEntriesToSnapshot(snapshot, compareId, entries),
    )
  })

  const unsubscribeEntry = api.onEntryUpdate((compareId, entry) => {
    useCompareStore.getState().updateEntry(compareId, entry)
    useAppStore.getState().updateCompareTabSnapshotByCompareId(compareId, (snapshot) =>
      applyEntryUpdateToSnapshot(snapshot, compareId, entry),
    )
  })

  return () => {
    unsubscribeScan()
    unsubscribeEntry()
  }
}