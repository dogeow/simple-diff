import { formatDuration } from '@shared/format-duration'
import { useCompareStore } from '../stores/compare-store'

export function CompareStatusIndicator() {
  const scanning = useCompareStore((state) => state.scanning)
  const comparing = useCompareStore((state) => state.comparing)
  const paused = useCompareStore((state) => state.paused)
  const done = useCompareStore((state) => state.done)
  const duration = useCompareStore((state) => state.duration)

  const activeStatusLabel = scanning && comparing
    ? '扫描并对比中…'
    : scanning
      ? '扫描中…'
      : comparing
        ? '对比中…'
        : paused
          ? '已暂停'
          : null

  if (!activeStatusLabel && !done) {
    return null
  }

  return (
    <div className="shrink-0 flex items-center gap-3 text-xs">
      {activeStatusLabel && !paused && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2 py-0.5 font-medium text-blue-300">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {activeStatusLabel}
        </span>
      )}
      {activeStatusLabel && paused && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-0.5 font-medium text-amber-300">
          <span className="inline-flex h-2 w-2 items-center justify-center">
            <span className="h-2 w-0.5 bg-current" />
            <span className="ml-0.5 h-2 w-0.5 bg-current" />
          </span>
          {activeStatusLabel}
        </span>
      )}
      {!activeStatusLabel && done && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-300">
          <span aria-hidden="true">✓</span>
          完成 {formatDuration(duration)}
        </span>
      )}
    </div>
  )
}

export function CompareErrorBanner() {
  const error = useCompareStore((state) => state.error)

  if (!error) {
    return null
  }

  return (
    <div className="mx-3 mt-2 rounded-md border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-300" role="alert">
      {error}
    </div>
  )
}
