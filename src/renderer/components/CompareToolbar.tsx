import { useState, useRef, useEffect } from 'react'
import type { CompareFilter, StrategyName, SyncTaskSnapshot } from '../../../shared/types'
import type { CompareStats } from '../../../shared/types'
import type { ViewMode, HideDotFilter } from '../stores/compare-store'
import { formatSyncProgress } from '../utils/format-sync-progress'
import FilterModal from './FilterModal'

const STRATEGY_LABELS: Record<StrategyName, string> = {
  size: '文件大小',
  mtime: '修改时间',
  quick_hash: '快速内容签名',
  hash: '内容哈希',
}

const FILTERS: { value: CompareFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'paired', label: '双方' },
  { value: 'different', label: '不同' },
  { value: 'left_only', label: '仅左' },
  { value: 'right_only', label: '仅右' },
  { value: 'equal', label: '相同' },
  { value: 'unresolved', label: '待比/对比中' },
]

interface CompareToolbarProps {
  readonly filter: CompareFilter
  readonly onFilterChange: (filter: CompareFilter) => void
  readonly stats: CompareStats
  readonly pendingCount: number
  readonly viewMode: ViewMode
  readonly setViewMode: (mode: ViewMode) => void
  readonly allExpanded: boolean
  readonly toggleExpandAll: () => void
  readonly strategies: readonly StrategyName[]
  readonly onToggleStrategy: (strategy: StrategyName) => void
  readonly extensionFilter: readonly string[]
  readonly setExtensionFilter: (filter: readonly string[]) => void | Promise<void>
  readonly hideDot: boolean
  readonly setHideDot: (v: boolean) => void
  readonly hideDotFilter: HideDotFilter
  readonly setHideDotFilter: (v: HideDotFilter) => void
  readonly compareLoading: boolean
  readonly comparePaused: boolean
  readonly compareDone: boolean
  readonly hasComparedResult: boolean
  readonly onPauseCompare: () => void | Promise<void>
  readonly onResumeCompare: () => void | Promise<void>
  readonly onRestartCompare: () => void | Promise<void>
  readonly hasGlobalSyncTask: boolean
  readonly syncTask: SyncTaskSnapshot | null
  readonly onStartSync: (direction: 'left_to_right' | 'right_to_left') => void
  readonly onPauseSync: () => void
  readonly onResumeSync: () => void
  readonly onClearSync: () => void
}

export default function CompareToolbar({
  filter,
  onFilterChange,
  stats,
  pendingCount,
  viewMode,
  setViewMode,
  allExpanded,
  toggleExpandAll,
  strategies,
  onToggleStrategy,
  extensionFilter,
  setExtensionFilter,
  hideDot,
  setHideDot,
  hideDotFilter,
  setHideDotFilter,
  compareLoading,
  comparePaused,
  compareDone,
  hasComparedResult,
  onPauseCompare,
  onResumeCompare,
  onRestartCompare,
  hasGlobalSyncTask,
  syncTask,
  onStartSync,
  onPauseSync,
  onResumeSync,
  onClearSync,
}: CompareToolbarProps) {
  const [dotDropOpen, setDotDropOpen] = useState(false)
  const dotDropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dotDropOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (dotDropRef.current && !dotDropRef.current.contains(e.target as Node)) {
        setDotDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dotDropOpen])

  const compactButtonBaseClass = 'h-7 rounded px-2 text-[11px] font-medium leading-none transition-colors'
  const compareActionLabel = hasComparedResult ? '重启对比' : '首次对比'

  const viewModeBtn = (mode: ViewMode, label: string) => (
    <button
      onClick={() => setViewMode(mode)}
      className={`${compactButtonBaseClass} ${
        viewMode === mode
          ? 'bg-blue-600 text-white'
          : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
      }`}
    >
      {label}
    </button>
  )

  const canStartSync = compareDone && !compareLoading && pendingCount === 0 && stats.total > 0

  return (
    <div className="flex flex-col gap-1.5 px-1.5 py-1">
      {/* Toolbar row 1: filters + stats + view mode */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={toggleExpandAll}
          className={`${compactButtonBaseClass} bg-neutral-700 text-neutral-200 hover:bg-neutral-600`}
        >
          {allExpanded ? '收起' : '展开'}
        </button>
        <div className="flex flex-wrap items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => onFilterChange(f.value)}
              className={`${compactButtonBaseClass} ${
                filter === f.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          {syncTask && (
            <div className="flex min-w-0 max-w-full items-center gap-2 rounded border border-neutral-700 bg-neutral-800/70 px-2 py-1 text-xs text-neutral-300">
              <span className="shrink-0 tabular-nums">
                同步 {syncTask.completedItems}/{syncTask.totalItems} · {formatSyncProgress(syncTask.completedItems, syncTask.totalItems)}
              </span>
              <span className={`w-12 shrink-0 text-left ${syncTask.status === 'running' ? 'text-blue-400' : syncTask.status === 'completed' ? 'text-green-400' : 'text-yellow-400'}`}>
                {syncTask.status === 'running'
                  ? '进行中'
                  : syncTask.status === 'paused'
                    ? '已暂停'
                    : syncTask.status === 'completed'
                      ? '已完成'
                      : '失败'}
              </span>
              <div className="min-w-0 w-56">
                {syncTask.currentPath && <span className="block truncate text-neutral-500">{syncTask.currentPath}</span>}
              </div>
              {syncTask.status === 'running' && (
                <button onClick={onPauseSync} className="shrink-0 whitespace-nowrap rounded bg-neutral-700 px-2 py-1 text-[11px] font-medium leading-none hover:bg-neutral-600">
                  暂停
                </button>
              )}
              {(syncTask.status === 'paused' || syncTask.status === 'failed') && (
                <button onClick={onResumeSync} className="shrink-0 whitespace-nowrap rounded bg-blue-600 px-2 py-1 text-[11px] font-medium leading-none text-white hover:bg-blue-500">
                  继续
                </button>
              )}
              {syncTask.status !== 'running' && (
                <button onClick={onClearSync} className="shrink-0 whitespace-nowrap rounded bg-neutral-700 px-2 py-1 text-[11px] font-medium leading-none hover:bg-neutral-600">
                  清除
                </button>
              )}
            </div>
          )}
          <div className="flex gap-2 text-xs text-neutral-400">
            <span>共 {stats.total}</span>
            <span className="text-green-400">相同 {stats.equal}</span>
            <span className="text-yellow-400">不同 {stats.different}</span>
            <span className="text-blue-400">仅左 {stats.leftOnly}</span>
            <span className="text-purple-400">仅右 {stats.rightOnly}</span>
            {pendingCount > 0 && <span className="text-neutral-500">待比 {pendingCount}</span>}
          </div>
          <div className="flex flex-wrap gap-1">
            {!hasGlobalSyncTask && (
              <>
                <button
                  onClick={() => onStartSync('left_to_right')}
                  disabled={!canStartSync}
                  className="h-7 rounded bg-emerald-700 px-2 text-[11px] font-medium leading-none text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  同步到右
                </button>
                <button
                  onClick={() => onStartSync('right_to_left')}
                  disabled={!canStartSync}
                  className="h-7 rounded bg-cyan-700 px-2 text-[11px] font-medium leading-none text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  同步到左
                </button>
              </>
            )}
            {viewModeBtn('split', '分栏')}
            {viewModeBtn('merged', '合并')}
          </div>
        </div>
      </div>

      {syncTask?.lastError && (
        <div className="rounded border border-red-800 bg-red-900/20 px-2 py-1 text-xs text-red-300">
          同步错误: {syncTask.lastError}
        </div>
      )}
      {/* Toolbar row 2: strategies + extension filter + hidden files */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-neutral-500">策略:</span>
          {(Object.keys(STRATEGY_LABELS) as StrategyName[]).map((strategy) => {
            const active = strategies.includes(strategy)

            return (
              <button
                key={strategy}
                onClick={() => onToggleStrategy(strategy)}
                className={`h-7 rounded px-2.5 text-[11px] font-medium leading-none transition-colors ${
                  active
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                }`}
              >
                {STRATEGY_LABELS[strategy] ?? strategy}
              </button>
            )
          })}
          {strategies.length === 0 && (
            <span className="text-xs text-neutral-600">至少选择一个策略</span>
          )}
        </div>

        <FilterModal extensionFilter={extensionFilter} onChange={setExtensionFilter} />

        {compareLoading ? (
          <>
            <button
              onClick={onPauseCompare}
              className="h-7 rounded bg-amber-600 px-2.5 text-[11px] font-medium leading-none text-white transition-colors hover:bg-amber-500"
            >
              暂停对比
            </button>
            <button
              onClick={onRestartCompare}
              disabled={strategies.length === 0}
              className="h-7 rounded bg-blue-600 px-2.5 text-[11px] font-medium leading-none text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              重启对比
            </button>
          </>
        ) : comparePaused ? (
          <>
            <button
              onClick={onResumeCompare}
              disabled={strategies.length === 0}
              className="h-7 rounded bg-emerald-600 px-2.5 text-[11px] font-medium leading-none text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              继续对比
            </button>
            <button
              onClick={onRestartCompare}
              disabled={strategies.length === 0}
              className="h-7 rounded bg-blue-600 px-2.5 text-[11px] font-medium leading-none text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              重启对比
            </button>
          </>
        ) : (
          <button
            onClick={onRestartCompare}
            disabled={strategies.length === 0}
            className="h-7 rounded bg-blue-600 px-2.5 text-[11px] font-medium leading-none text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {compareActionLabel}
          </button>
        )}

        <div className="relative flex items-center" ref={dotDropRef}>
          <button
            onClick={() => setHideDot(!hideDot)}
            className={`h-7 rounded-l px-2.5 text-[11px] font-medium leading-none transition-colors ${
              hideDot
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
            }`}
          >
            隐藏.*
          </button>
          <button
            onClick={() => setDotDropOpen(!dotDropOpen)}
            className={`h-7 rounded-r border-l px-1.5 text-[11px] font-medium leading-none transition-colors ${
              hideDot
                ? 'border-blue-500 bg-blue-600 text-white hover:bg-blue-500'
                : 'border-neutral-600 bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
            }`}
          >
            ▾
          </button>
          {dotDropOpen && (
            <div className="absolute top-full left-0 z-50 mt-1 w-32 rounded border border-neutral-600 bg-neutral-800 py-1 shadow-xl">
              {([
                { value: 'all' as HideDotFilter, label: '全部隐藏' },
                { value: 'files' as HideDotFilter, label: '仅隐藏文件' },
                { value: 'dirs' as HideDotFilter, label: '仅隐藏目录' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setHideDotFilter(opt.value)
                    if (!hideDot) setHideDot(true)
                    setDotDropOpen(false)
                  }}
                  className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-neutral-700 ${
                    hideDotFilter === opt.value ? 'text-blue-400' : 'text-neutral-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
