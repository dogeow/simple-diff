import { useShallow } from 'zustand/react/shallow'
import { useCompareStore } from '../stores/compare-store'
import { useAppStore } from '../stores/app-store'
import { formatSyncProgress } from '../utils/format-sync-progress'
import { openCompareTab, openSyncTaskView } from '../utils/compare-session-navigation'

export default function GlobalRunningIndicator() {
  const page = useAppStore((s) => s.page)
  const activeCompareTabId = useAppStore((s) => s.activeCompareTabId)

  const { scanning, comparing, paused, syncTask, entrySummary, leftSource, rightSource } = useCompareStore(useShallow((s) => ({
    scanning: s.scanning,
    comparing: s.comparing,
    paused: s.paused,
    syncTask: s.syncTask,
    entrySummary: s.entrySummary,
    leftSource: s.leftSource,
    rightSource: s.rightSource,
  })))

  // Hide on home/compare pages — those have their own status indicators
  if (page === 'home' || page === 'compare') return null

  const compareRunning = scanning || comparing
  const syncRunning = syncTask?.status === 'running' || syncTask?.status === 'paused'

  if (!compareRunning && !syncRunning && !paused) return null

  const handleClick = () => {
    if (compareRunning || paused) {
      if (!openCompareTab(activeCompareTabId ?? undefined, { expandLogs: false })) {
        useAppStore.getState().setPage('compare')
      }
      return
    }
    if (syncRunning) {
      if (!openSyncTaskView({ expandLogs: false })) {
        useAppStore.getState().setPage('compare')
      }
    }
  }

  let toneClass = 'bg-blue-500/15 text-blue-200 ring-blue-500/40'
  let label = ''
  let detail = ''

  if (compareRunning) {
    label = scanning && comparing ? '扫描并对比中' : scanning ? '扫描中' : '对比中'
    const total = entrySummary.stats.total
    detail = total > 0 ? `${total} 项` : ''
  } else if (paused) {
    toneClass = 'bg-amber-500/15 text-amber-200 ring-amber-500/40'
    label = '对比已暂停'
    const total = entrySummary.stats.total
    detail = total > 0 ? `${total} 项` : ''
  } else if (syncRunning && syncTask) {
    if (syncTask.status === 'running') {
      label = '同步中'
    } else {
      toneClass = 'bg-amber-500/15 text-amber-200 ring-amber-500/40'
      label = '同步已暂停'
    }
    detail = `${syncTask.completedItems}/${syncTask.totalItems} · ${formatSyncProgress(syncTask.completedItems, syncTask.totalItems)}`
  }

  // Extra context: show source labels if available
  const sourceHint = leftSource && rightSource
    ? `${leftSource.type === 'sftp' ? 'SFTP' : '本地'} ↔ ${rightSource.type === 'sftp' ? 'SFTP' : '本地'}`
    : ''

  return (
    <button
      onClick={handleClick}
      title="跳转到对比页查看进度"
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset transition-colors hover:brightness-110 ${toneClass}`}
    >
      {compareRunning ? (
        <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : paused ? (
        <span className="inline-flex h-2.5 w-2.5 items-center justify-center">
          <span className="h-2.5 w-0.5 bg-current" />
          <span className="ml-0.5 h-2.5 w-0.5 bg-current" />
        </span>
      ) : (
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
      )}
      <span>{label}</span>
      {detail && (
        <span className="rounded bg-black/20 px-1 py-0.5 font-mono text-[10px] tabular-nums">{detail}</span>
      )}
      {sourceHint && <span className="text-[10px] opacity-70">{sourceHint}</span>}
    </button>
  )
}
