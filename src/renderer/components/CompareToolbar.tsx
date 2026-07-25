import { useState, useRef, useEffect } from 'react'
import type { CompareFilter, StrategyName, SyncTaskSnapshot } from '../../../shared/types'
import type { CompareStats } from '../../../shared/types'
import type { ViewMode, HideDotFilter } from '../stores/compare-store'
import { formatSyncProgress } from '../utils/format-sync-progress'
import { openSyncTaskView } from '../utils/compare-session-navigation'
import { getRuntimeInfo } from '../runtime/runtime-info'
import FilterModal from './FilterModal'
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, ChevronUpDownIcon, PauseIcon, PlayIcon, RefreshIcon } from './Icons'

const STRATEGY_LABELS: Record<StrategyName, string> = {
  size: '文件大小',
  mtime: '修改时间',
  quick_hash: '快速内容签名',
  hash: '内容哈希',
}

const FILTERS: { value: CompareFilter; label: string; statKey?: keyof CompareStats | 'pending' | 'paired' }[] = [
  { value: 'all', label: '全部', statKey: 'total' },
  { value: 'paired', label: '双方', statKey: 'paired' },
  { value: 'different', label: '不同', statKey: 'different' },
  { value: 'left_only', label: '仅左', statKey: 'leftOnly' },
  { value: 'right_only', label: '仅右', statKey: 'rightOnly' },
  { value: 'equal', label: '相同', statKey: 'equal' },
  { value: 'unresolved', label: '待比', statKey: 'pending' },
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
  readonly dirtyCount: number
  readonly onPauseCompare: () => void | Promise<void>
  readonly onResumeCompare: () => void | Promise<void>
  readonly onRestartCompare: () => void | Promise<void>
  readonly onRecompareDirtyPaths: () => void | Promise<void>
  readonly hasGlobalSyncTask: boolean
  readonly syncTask: SyncTaskSnapshot | null
  readonly onStartSync: (direction: 'left_to_right' | 'right_to_left') => void
  readonly onPauseSync: () => void
  readonly onResumeSync: () => void
  readonly onClearSync: () => void
}

const COMPACT_BTN = 'inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium leading-none transition-colors'
const QUIET_BTN = `${COMPACT_BTN} text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200`
const DISABLED_BTN = 'disabled:cursor-not-allowed disabled:opacity-40'

function getFilterStatValue(statKey: keyof CompareStats | 'pending' | 'paired' | undefined, stats: CompareStats, pendingCount: number): number | null {
  if (!statKey) return null
  if (statKey === 'pending') return pendingCount
  if (statKey === 'paired') return Math.max(0, stats.total - stats.leftOnly - stats.rightOnly)
  return stats[statKey]
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
  dirtyCount,
  onPauseCompare,
  onResumeCompare,
  onRestartCompare,
  onRecompareDirtyPaths,
  hasGlobalSyncTask,
  syncTask,
  onStartSync,
  onPauseSync,
  onResumeSync,
  onClearSync,
}: CompareToolbarProps) {
  const supportsSync = getRuntimeInfo().supportsSync
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
      aria-pressed={viewMode === mode}
      className={`${COMPACT_BTN} ${
        viewMode === mode
          ? 'bg-neutral-700 text-neutral-100 shadow-sm'
          : 'text-neutral-500 hover:bg-neutral-800/80 hover:text-neutral-300'
      }`}
    >
      {label}
    </button>
  )

  const canStartSync = compareDone && !compareLoading && pendingCount === 0 && stats.total > 0

  return (
    <div className="mx-1.5 my-1.5 flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900/55 p-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">结果</span>

        <button
          onClick={toggleExpandAll}
          title={allExpanded ? '收起全部目录' : '展开全部目录'}
          aria-label={allExpanded ? '收起' : '展开'}
          className={`${QUIET_BTN} px-2`}
        >
          {allExpanded ? <ChevronDownIcon width={11} height={11} /> : <ChevronRightIcon width={11} height={11} />}
          <span>目录</span>
        </button>

        <div className="flex flex-wrap items-center gap-0.5 rounded-lg bg-neutral-800/55 p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => onFilterChange(f.value)}
              aria-label={f.label}
              aria-pressed={filter === f.value}
              className={`${COMPACT_BTN} ${
                filter === f.value
                  ? 'bg-blue-500/15 text-blue-200 shadow-sm ring-1 ring-inset ring-blue-500/25'
                  : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
              }`}
            >
              {f.label}
              {(() => {
                const value = getFilterStatValue(f.statKey, stats, pendingCount)
                if (value == null || (value === 0 && (!hasComparedResult || f.statKey === 'pending'))) return null
                return (
                  <>
                    {' '}
                    <span aria-hidden="true" className="ml-0.5 rounded-full bg-neutral-900/50 px-1.5 py-0.5 text-[10px] tabular-nums text-neutral-400">
                      {value}
                    </span>
                  </>
                )
              })()}
            </button>
          ))}
        </div>

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {supportsSync && syncTask && (
            <div className="flex min-w-0 max-w-full items-center gap-2 rounded-lg bg-neutral-800/55 px-2 py-1 text-xs text-neutral-300">
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
              <button onClick={() => openSyncTaskView({ expandLogs: true })} className={QUIET_BTN}>
                详情
              </button>
              {syncTask.status === 'running' && (
                <button onClick={onPauseSync} className={QUIET_BTN}>
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
                <button onClick={onClearSync} className={QUIET_BTN}>
                  清除
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-0.5 rounded-lg bg-neutral-800/55 p-0.5">
            {supportsSync && !hasGlobalSyncTask && (
              <>
                <button
                  onClick={() => onStartSync('left_to_right')}
                  disabled={!canStartSync}
                  className={`${COMPACT_BTN} text-emerald-300 hover:bg-emerald-500/10 ${DISABLED_BTN}`}
                >
                  <ArrowRightIcon width={11} height={11} />
                  同步到右
                </button>
                <button
                  onClick={() => onStartSync('right_to_left')}
                  disabled={!canStartSync}
                  className={`${COMPACT_BTN} text-cyan-300 hover:bg-cyan-500/10 ${DISABLED_BTN}`}
                >
                  <ArrowLeftIcon width={11} height={11} />
                  同步到左
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-0.5 rounded-lg bg-neutral-800/55 p-0.5" aria-label="显示方式">
            {viewModeBtn('split', '分栏')}
            {viewModeBtn('merged', '合并')}
          </div>
        </div>
      </div>

      {supportsSync && syncTask?.lastError && (
        <div className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-2.5 py-1.5 text-xs text-rose-300">
          同步错误: {syncTask.lastError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-neutral-800/80 pt-2">
        <span className="shrink-0 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">比较依据</span>

        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(STRATEGY_LABELS) as StrategyName[]).map((strategy) => {
            const active = strategies.includes(strategy)

            return (
              <button
                key={strategy}
                onClick={() => onToggleStrategy(strategy)}
                aria-pressed={active}
                className={`${COMPACT_BTN} ${
                  active
                    ? 'bg-blue-500/10 text-blue-200 ring-1 ring-inset ring-blue-500/25 hover:bg-blue-500/15'
                    : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
                }`}
              >
                {active && <CheckIcon width={10} height={10} />}
                {STRATEGY_LABELS[strategy] ?? strategy}
              </button>
            )
          })}
          {strategies.length === 0 && (
            <span className="text-[11px] text-amber-300">至少选择一个策略</span>
          )}
        </div>

        <FilterModal extensionFilter={extensionFilter} onChange={setExtensionFilter} />

        <div className="relative flex items-center" ref={dotDropRef}>
          <button
            onClick={() => setHideDot(!hideDot)}
            aria-pressed={hideDot}
            className={`h-7 rounded-l-lg px-2.5 text-[11px] font-medium leading-none transition-colors ${
              hideDot
                ? 'bg-blue-500/10 text-blue-200 ring-1 ring-inset ring-blue-500/25'
                : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
            }`}
          >
            隐藏.*
          </button>
          <button
            onClick={() => setDotDropOpen(!dotDropOpen)}
            aria-label="选择隐藏类型"
            className={`flex h-7 items-center justify-center rounded-r-lg px-1.5 text-[11px] font-medium leading-none transition-colors ${
              hideDot
                ? 'border-l border-blue-500/20 bg-blue-500/10 text-blue-200 ring-1 ring-inset ring-blue-500/25 hover:bg-blue-500/15'
                : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
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

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          {dirtyCount > 0 && (
            <span className="inline-flex h-7 items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 text-[11px] text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
              <span className="tabular-nums">待重比 {dirtyCount}</span>
            </span>
          )}

          {dirtyCount > 0 && !compareLoading && (
            <button
              onClick={onRecompareDirtyPaths}
              disabled={strategies.length === 0}
              className={`${QUIET_BTN} text-amber-300 hover:bg-amber-500/10 ${DISABLED_BTN}`}
            >
              <RefreshIcon width={10} height={10} />
              重比变更
            </button>
          )}

          {compareLoading ? (
            <>
              <button
                onClick={onPauseCompare}
                aria-label="暂停对比"
                className={`${QUIET_BTN} text-amber-300 hover:bg-amber-500/10`}
              >
                <PauseIcon width={10} height={10} />
                暂停
              </button>
              <button
                onClick={onRestartCompare}
                disabled={strategies.length === 0}
                className={`${COMPACT_BTN} bg-blue-600 text-white shadow-sm hover:bg-blue-500 ${DISABLED_BTN}`}
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
                className={`${COMPACT_BTN} bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 ${DISABLED_BTN}`}
              >
                <PlayIcon width={10} height={10} />
                继续对比
              </button>
              <button
                onClick={onRestartCompare}
                disabled={strategies.length === 0}
                className={`${QUIET_BTN} ${DISABLED_BTN}`}
              >
                <RefreshIcon width={10} height={10} />
                重启对比
              </button>
            </>
          ) : (
            <button
              onClick={onRestartCompare}
              disabled={strategies.length === 0}
              className={`${COMPACT_BTN} bg-blue-600 text-white shadow-sm hover:bg-blue-500 ${DISABLED_BTN}`}
            >
              {hasComparedResult ? <RefreshIcon width={10} height={10} /> : <PlayIcon width={10} height={10} />}
              {compareActionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
