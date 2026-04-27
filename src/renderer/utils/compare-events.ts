import type { CompareEntry } from '../../../shared/types'
import { useAppStore } from '../stores/app-store'
import { applyEntryUpdatesToSnapshot, applyScanEntriesToSnapshot, useCompareStore } from '../stores/compare-store'
import { addRendererLog } from '../stores/log-store'

const EVENT_FLUSH_INTERVAL_MS = 16

interface PendingCompareEvents {
  readonly scanEntries: CompareEntry[]
  readonly entryUpdates: CompareEntry[]
  scanBatchCount: number
  entryBatchCount: number
}

interface CompareEventAPI {
  onScanComplete: (callback: (compareId: string, entries: readonly CompareEntry[]) => void) => (() => void)
  onEntryUpdate: (callback: (compareId: string, entries: readonly CompareEntry[]) => void) => (() => void)
}

function describeCompareTarget(compareId: string): string {
  const activeCompareId = useCompareStore.getState().activeCompareId
  const tab = useAppStore
    .getState()
    .compareTabs.find((t) => t.snapshot.activeCompareId === compareId)
  const label = tab?.title ?? '未知会话'
  return compareId === activeCompareId ? `${label}（当前）` : `${label}（后台）`
}

function createPendingCompareEvents(): PendingCompareEvents {
  return {
    scanEntries: [],
    entryUpdates: [],
    scanBatchCount: 0,
    entryBatchCount: 0,
  }
}

function isCurrentActiveCompare(compareId: string): boolean {
  return useCompareStore.getState().activeCompareId === compareId
}

export function bindCompareEvents(api: CompareEventAPI): () => void {
  const entryUpdateCountByCompareId = new Map<string, number>()
  const pendingByCompareId = new Map<string, PendingCompareEvents>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  addRendererLog('compare', 'info', 'compare 事件监听已绑定')

  const getPendingCompareEvents = (compareId: string): PendingCompareEvents => {
    const existing = pendingByCompareId.get(compareId)
    if (existing) return existing

    const pending = createPendingCompareEvents()
    pendingByCompareId.set(compareId, pending)
    return pending
  }

  const flushPendingCompareEvents = (): void => {
    flushTimer = null
    if (pendingByCompareId.size === 0) return

    const pendingEntries = Array.from(pendingByCompareId.entries())
    pendingByCompareId.clear()

    for (const [compareId, pending] of pendingEntries) {
      if (pending.scanEntries.length > 0) {
        addRendererLog(
          'compare',
          'info',
          `收到扫描批次 ${describeCompareTarget(compareId)} batches=${pending.scanBatchCount} entries=${pending.scanEntries.length}`,
        )

        useCompareStore.getState().setScanEntries(compareId, pending.scanEntries)
        if (!isCurrentActiveCompare(compareId)) {
          useAppStore.getState().updateCompareTabSnapshotByCompareId(compareId, (snapshot) =>
            applyScanEntriesToSnapshot(snapshot, compareId, pending.scanEntries),
          )
        }
      }

      if (pending.entryUpdates.length > 0) {
        const previousCount = entryUpdateCountByCompareId.get(compareId) ?? 0
        const nextCount = previousCount + pending.entryUpdates.length
        entryUpdateCountByCompareId.set(compareId, nextCount)

        if (previousCount < 200 || Math.floor(previousCount / 2000) !== Math.floor(nextCount / 2000)) {
          const sample = pending.entryUpdates[0]
          addRendererLog(
            'compare',
            'info',
            `收到条目更新批次 ${describeCompareTarget(compareId)} batches=${pending.entryBatchCount} size=${pending.entryUpdates.length} 累计=${nextCount} sample=${sample.relativePath || '.'}@${sample.state}`,
          )
        }

        useCompareStore.getState().updateEntries(compareId, pending.entryUpdates)
        if (!isCurrentActiveCompare(compareId)) {
          useAppStore.getState().updateCompareTabSnapshotByCompareId(compareId, (snapshot) =>
            applyEntryUpdatesToSnapshot(snapshot, compareId, pending.entryUpdates),
          )
        }
      }
    }
  }

  const scheduleFlush = (): void => {
    if (flushTimer) return
    flushTimer = setTimeout(flushPendingCompareEvents, EVENT_FLUSH_INTERVAL_MS)
  }

  const unsubscribeScan = api.onScanComplete((compareId, entries) => {
    if (entries.length === 0) return
    const pending = getPendingCompareEvents(compareId)
    pending.scanBatchCount += 1
    pending.scanEntries.push(...entries)
    scheduleFlush()
  })

  const unsubscribeEntry = api.onEntryUpdate((compareId, entries) => {
    if (entries.length === 0) return

    const pending = getPendingCompareEvents(compareId)
    pending.entryBatchCount += 1
    pending.entryUpdates.push(...entries)
    scheduleFlush()
  })

  return () => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    pendingByCompareId.clear()
    addRendererLog('compare', 'info', 'compare 事件监听已解绑')
    unsubscribeScan()
    unsubscribeEntry()
  }
}