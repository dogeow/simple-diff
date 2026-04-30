import { useState, useRef, useEffect } from 'react'
import type { CompareFilter, StrategyName, SyncTaskSnapshot } from '../../../shared/types'
import type { CompareStats } from '../../../shared/types'
import type { ViewMode, HideDotFilter } from '../stores/compare-store'
import { formatSyncProgress } from '../utils/format-sync-progress'
import FilterModal from './FilterModal'
import { ArrowLeftIcon, ArrowRightIcon, ChevronDownIcon, ChevronRightIcon, ChevronUpDownIcon, PauseIcon, PlayIcon, RefreshIcon } from './Icons'

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

const STAT_TONES = {
  total: 'text-neutral-300',
  equal: 'text-emerald-300',
  different: 'text-amber-300',
  leftOnly: 'text-sky-300',
  rightOnly: 'text-violet-300',
  pending: 'text-neutral-500',
} as const

const STAT_DOTS = {
  total: 'bg-neutral-500',
  equal: 'bg-emerald-400',
  different: 'bg-amber-400',
  leftOnly: 'bg-sky-400',
  rightOnly: 'bg-violet-400',
  pending: 'bg-neutral-600',
} as const

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

const COMPACT_BTN = 'inline-flex items-center gap-1 h-7 rounded-md px-2 text-[11px] font-medium leading-none transition-colors'

function StatChip({ tone, label, value }: { tone: keyof typeof STAT_TONES; label: string; value: number }) {
  return (
    <span className={`inline-flex items-center gap-1 ${STAT_TONES[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STAT_DOTS[tone]}`} aria-hidden="true" />
      <span className="tabular-nums">{`${label} ${value}`}</span>
    </span>
  )
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

  const compareActionLabel = hasComparedResult ? '重启对比' : '首次对比'

  const viewModeBtn = (mode: ViewMode, label: string) => (
    <button
      onClick={() => setViewMode(mode)}
      className={`${COMPACT_BTN} ${
        viewMode === mode
          ? 'bg-blue-600 text-white'
          : 'border border-neutral-700 bg-neutral-800/70 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800'
      }`}
    >
      {label}
    </button>
  )

  const canStartSync = compareDone && !compareLoading && pendingCount === 0 && stats.total > 0

  return (
    <div className="flex flex-col gap-2 px-1.5 py-1.5">
      {/* Toolbar row 1: filters + stats + view mode */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={toggleExpandAll}
          className={`${COMPACT_BTN} border border-neutral-700 bg-neutral-800/70 text-neutral-200 hover:border-neutral-600 hover:bg-neutral-800`}
        >
          {allExpanded ? <ChevronDownIcon width={11} height={11} /> : <ChevronRightIcon width={11} height={11} />}
          {allExpanded ? '收起' : '展开'}
        </button>

        <span className="h-4 w-px bg-neutral-700" aria-hidden="true" />

        <div className="flex flex-wrap items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => onFilterChange(f.value)}
              className={`${COMPACT_BTN} ${
                filter === f.value
                  ? 'bg-blue-600 text-white'
                  : 'border border-neutral-700 bg-neutral-800/70 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          {syncTask && (
            <div className="flex min-w-0 max-w-full items-center gap-2 rounded-md border border-neutral-700 bg-neutral-800/70 px-2 py-1 text-xs text-neutral-300">
              <span className="shrink-0 tabular-nums text-neutral-400">
                同步 {syncTask.completedItems}/{syncTask.totalItems} · {formatSyncProgress(syncTask.completedItems, syncTask.totalItems)}
              </span>
              <span className={`w-12 shrink-0 text-left font-medium ${
                syncTask.status === 'running'
                  ? 'text-blue-300'
                  : syncTask.status === 'completed'
                    ? 'text-emerald-300'
                    : syncTask.status === 'paused'
                      ? 'text-amber-300'
                      : 'text-rose-300'
              }`}>
                {syncTask.status === 'running'
                  ? '进行中'
                  : syncTask.status === 'paused'
                    ? '已暂停'
                    : syncTask.status === 'completed'
                      ? '已完成'
                      : '失败'}
              </span>
              <div className="min-w-0 w-56">
                {syncTask.currentPath && <span className="block truncate font-mono text-neutral-500">{syncTask.currentPath}</span>}
              </div>
              {syncTask.status === 'running' && (
                <button onClick={onPauseSync} className={`${COMPACT_BTN} border border-neutral-600 bg-neutral-700/80 text-neutral-200 hover:bg-neutral-700`}>
                  <PauseIcon width={10} height={10} />
                  暂停
                </button>
              )}
              {(syncTask.status === 'paused' || syncTask.status === 'failed') && (
                <button onClick={onResumeSync} className={`${COMPACT_BTN} bg-blue-600 text-white hover:bg-blue-500`}>
                  <PlayIcon width={10} height={10} />
                  继续
                </button>
              )}
              {syncTask.status !== 'running' && (
                <button onClick={onClearSync} className={`${COMPACT_BTN} border border-neutral-600 bg-neutral-700/80 text-neutral-200 hover:bg-neutral-700`}>
                  清除
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 rounded-md border border-neutral-800 bg-neutral-900/40 px-2.5 py-1 text-[11px]">
            <StatChip tone="total" label="共" value={stats.total} />
            <StatChip tone="equal" label="相同" value={stats.equal} />
            <StatChip tone="different" label="不同" value={stats.different} />
            <StatChip tone="leftOnly" label="仅左" value={stats.leftOnly} />
            <StatChip tone="rightOnly" label="仅右" value={stats.rightOnly} />
            {pendingCount > 0 && <StatChip tone="pending" label="待比" value={pendingCount} />}
          </div>

          <div className="flex flex-wrap gap-1">
            {!hasGlobalSyncTask && (
              <>
                <button
                  onClick={() => onStartSync('left_to_right')}
                  disabled={!canStartSync}
                  className={`${COMPACT_BTN} bg-emerald-600 text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500`}
                >
                  <ArrowRightIcon width={11} height={11} />
                  同步到右
                </button>
                <button
                  onClick={() => onStartSync('right_to_left')}
                  disabled={!canStartSync}
                  className={`${COMPACT_BTN} bg-cyan-600 text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500`}
                >
                  <ArrowLeftIcon width={11} height={11} />
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
        <div className="rounded-md border border-rose-900/60 bg-rose-950/30 px-2 py-1 text-xs text-rose-300">
          同步错误: {syncTask.lastError}
        </div>
      )}

      {/* Toolbar row 2: strategies + extension filter + actions + hidden files */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-neutral-500">策略</span>
          {(Object.keys(STRATEGY_LABELS) as StrategyName[]).map((strategy) => {
            const active = strategies.includes(strategy)

            return (
              <button
                key={strategy}
                onClick={() => onToggleStrategy(strategy)}
                className={`${COMPACT_BTN} ${
                  active
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'border border-neutral-700 bg-neutral-800/70 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800'
                }`}
              >
                {STRATEGY_LABELS[strategy] ?? strategy}
              </button>
            )
          })}
          {strategies.length === 0 && (
            <span className="text-[11px] text-amber-300">至少选择一个策略</span>
          )}
        </div>

        <span className="h-4 w-px bg-neutral-700" aria-hidden="true" />

        <FilterModal extensionFilter={extensionFilter} onChange={setExtensionFilter} />

        <span className="h-4 w-px bg-neutral-700" aria-hidden="true" />

        {compareLoading ? (
          <>
            <button
              onClick={onPauseCompare}
              className={`${COMPACT_BTN} bg-amber-600 text-white hover:bg-amber-500`}
            >
              <PauseIcon width={10} height={10} />
              暂停对比
            </button>
            <button
              onClick={onRestartCompare}
              disabled={strategies.length === 0}
              className={`${COMPACT_BTN} bg-blue-600 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <RefreshIcon width={10} height={10} />
              重启对比
            </button>
          </>
        ) : comparePaused ? (
          <>
            <button
              onClick={onResumeCompare}
              disabled={strategies.length === 0}
              className={`${COMPACT_BTN} bg-emerald-600 text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <PlayIcon width={10} height={10} />
              继续对比
            </button>
            <button
              onClick={onRestartCompare}
              disabled={strategies.length === 0}
              className={`${COMPACT_BTN} bg-blue-600 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <RefreshIcon width={10} height={10} />
              重启对比
            </button>
          </>
        ) : (
          <button
            onClick={onRestartCompare}
            disabled={strategies.length === 0}
            className={`${COMPACT_BTN} bg-blue-600 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {hasComparedResult ? <RefreshIcon width={10} height={10} /> : <PlayIcon width={10} height={10} />}
            {compareActionLabel}
          </button>
        )}

        <span className="h-4 w-px bg-neutral-700" aria-hidden="true" />

        <div className="relative flex items-center" ref={dotDropRef}>
          <button
            onClick={() => setHideDot(!hideDot)}
            className={`h-7 rounded-l-md px-2.5 text-[11px] font-medium leading-none transition-colors ${
              hideDot
                ? 'bg-blue-600 text-white'
                : 'border border-neutral-700 bg-neutral-800/70 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800'
            }`}
          >
            隐藏.*
          </button>
          <button
            onClick={() => setDotDropOpen(!dotDropOpen)}
            aria-label="选择隐藏类型"
            className={`flex h-7 items-center justify-center rounded-r-md px-1.5 text-[11px] font-medium leading-none transition-colors ${
              hideDot
                ? 'border-l border-blue-500 bg-blue-600 text-white hover:bg-blue-500'
                : 'border border-l-0 border-neutral-700 bg-neutral-800/70 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800'
            }`}
          >
            <ChevronUpDownIcon width={11} height={11} />
          </button>
          {dotDropOpen && (
            <div className="absolute top-full left-0 z-50 mt-1 w-36 overflow-hidden rounded-md border border-neutral-700 bg-neutral-850 py-1 shadow-xl">
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
                  className={`block w-full px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-neutral-800 ${
                    hideDotFilter === opt.value ? 'text-blue-300' : 'text-neutral-300'
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
