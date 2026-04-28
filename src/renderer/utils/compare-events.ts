import type { CompareEntry } from '../../../shared/types'
import { useAppStore } from '../stores/app-store'
import { applyEntryUpdatesToSnapshot, applyScanEntriesToSnapshot, useCompareStore } from '../stores/compare-store'
import { addRendererLog } from '../stores/log-store'

const EVENT_FLUSH_INTERVAL_MS = 80

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

let flushBufferedCompareEventsImpl: ((compareId?: string) => void) | null = null

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

function shouldMirrorToCompareTabSnapshot(compareId: string): boolean {
  const compareState = useCompareStore.getState()
  if (compareState.activeCompareId !== compareId) {
    return true
  }

  return compareState.paused
}

export function bindCompareEvents(api: CompareEventAPI): () => void {
  const entryUpdateCountByCompareId = new Map<string, number>()
  const scanEntryCountByCompareId = new Map<string, number>()
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

  const flushPendingCompareEvents = (compareId?: string): void => {
    if (compareId == null) {
      flushTimer = null
    }
    if (pendingByCompareId.size === 0) return

    const pendingEntries = compareId == null
      ? Array.from(pendingByCompareId.entries())
      : pendingByCompareId.has(compareId)
        ? [[compareId, pendingByCompareId.get(compareId)!] as const]
        : []

    if (compareId == null) {
      pendingByCompareId.clear()
    } else {
      pendingByCompareId.delete(compareId)
      if (pendingByCompareId.size === 0 && flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
    }

    for (const [compareId, pending] of pendingEntries) {
      if (pending.scanEntries.length > 0) {
        const previousScanCount = scanEntryCountByCompareId.get(compareId) ?? 0
        const nextScanCount = previousScanCount + pending.scanEntries.length
        scanEntryCountByCompareId.set(compareId, nextScanCount)

        if (previousScanCount < 200 || Math.floor(previousScanCount / 5000) !== Math.floor(nextScanCount / 5000)) {
          addRendererLog(
            'compare',
            'info',
            `收到扫描批次 ${describeCompareTarget(compareId)} batches=${pending.scanBatchCount} entries=${pending.scanEntries.length} 累计=${nextScanCount}`,
          )
        }

        useCompareStore.getState().setScanEntries(compareId, pending.scanEntries)
        if (shouldMirrorToCompareTabSnapshot(compareId)) {
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
        if (shouldMirrorToCompareTabSnapshot(compareId)) {
          useAppStore.getState().updateCompareTabSnapshotByCompareId(compareId, (snapshot) =>
            applyEntryUpdatesToSnapshot(snapshot, compareId, pending.entryUpdates),
          )
        }
      }
    }
  }

  flushBufferedCompareEventsImpl = flushPendingCompareEvents

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
    if (flushBufferedCompareEventsImpl === flushPendingCompareEvents) {
      flushBufferedCompareEventsImpl = null
    }
    addRendererLog('compare', 'info', 'compare 事件监听已解绑')
    unsubscribeScan()
    unsubscribeEntry()
  }
}

export function flushBufferedCompareEvents(compareId?: string): void {
  flushBufferedCompareEventsImpl?.(compareId)
}