import { useState, useRef, useEffect } from 'react'
import type { CompareState, StrategyName, SyncTaskSnapshot } from '../../../shared/types'
import type { CompareStats } from '../../../shared/types'
import type { ViewMode, HideDotFilter } from '../stores/compare-store'
import FilterModal from './FilterModal'

const STRATEGY_LABELS: Record<StrategyName, string> = {
  size: '文件大小',
  mtime: '修改时间',
  quick_hash: '快速内容签名',
  hash: '内容哈希',
}

const FILTERS: { value: CompareState | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'different', label: '不同' },
  { value: 'left_only', label: '仅左' },
  { value: 'right_only', label: '仅右' },
  { value: 'equal', label: '相同' },
]

interface CompareToolbarProps {
  readonly filter: CompareState | 'all'
  readonly onFilterChange: (filter: CompareState | 'all') => void
  readonly stats: CompareStats
  readonly pendingCount: number
  readonly viewMode: ViewMode
  readonly setViewMode: (mode: ViewMode) => void
  readonly allExpanded: boolean
  readonly toggleExpandAll: () => void
  readonly strategies: readonly StrategyName[]
  readonly extensionFilter: readonly string[]
  readonly setExtensionFilter: (filter: readonly string[]) => void
  readonly hideDot: boolean
  readonly setHideDot: (v: boolean) => void
  readonly hideDotFilter: HideDotFilter
  readonly setHideDotFilter: (v: HideDotFilter) => void
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
  extensionFilter,
  setExtensionFilter,
  hideDot,
  setHideDot,
  hideDotFilter,
  setHideDotFilter,
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

  const viewModeBtn = (mode: ViewMode, label: string) => (
    <button
      onClick={() => setViewMode(mode)}
      className={`rounded px-2 py-1 text-xs transition-colors ${
        viewMode === mode
          ? 'bg-blue-600 text-white'
          : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
      }`}
    >
      {label}
    </button>
  )

  return (
    <>
      {/* Toolbar row 1: filters + stats + view mode */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleExpandAll}
          className="rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600"
        >
          {allExpanded ? '收起' : '展开'}
        </button>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => onFilterChange(f.value)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {syncTask && (
            <div className="flex min-w-0 items-center gap-2 rounded border border-neutral-700 bg-neutral-800/70 px-2 py-1 text-xs text-neutral-300">
              <span className="shrink-0 tabular-nums">
                同步 {syncTask.completedItems}/{syncTask.totalItems}
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
                <button onClick={onPauseSync} className="shrink-0 rounded bg-neutral-700 px-2 py-1 hover:bg-neutral-600">
                  暂停
                </button>
              )}
              {(syncTask.status === 'paused' || syncTask.status === 'failed') && (
                <button onClick={onResumeSync} className="shrink-0 rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-500">
                  继续
                </button>
              )}
              {syncTask.status !== 'running' && (
                <button onClick={onClearSync} className="shrink-0 rounded bg-neutral-700 px-2 py-1 hover:bg-neutral-600">
                  清除
                </button>
              )}
            </div>
          )}
          <div className="flex gap-2 text-xs text-neutral-400">
            <span>共 {stats.total}</span>
            <span className="text-green-400">同 {stats.equal}</span>
            <span className="text-yellow-400">异 {stats.different}</span>
            <span className="text-blue-400">左 {stats.leftOnly}</span>
            <span className="text-purple-400">右 {stats.rightOnly}</span>
            {pendingCount > 0 && <span className="text-neutral-500">待 {pendingCount}</span>}
          </div>
          <div className="flex gap-1">
            {!syncTask && (
              <>
                <button
                  onClick={() => onStartSync('left_to_right')}
                  className="rounded bg-emerald-700 px-2 py-1 text-xs text-white hover:bg-emerald-600"
                >
                  同步到右
                </button>
                <button
                  onClick={() => onStartSync('right_to_left')}
                  className="rounded bg-cyan-700 px-2 py-1 text-xs text-white hover:bg-cyan-600"
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
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-neutral-500">策略:</span>
          {strategies.length === 0 ? (
            <span className="text-xs text-neutral-600">无</span>
          ) : (
            strategies.map((s) => (
              <span key={s} className="rounded bg-neutral-700 px-1.5 py-0.5 text-xs text-neutral-300">
                {STRATEGY_LABELS[s] ?? s}
              </span>
            ))
          )}
        </div>

        <FilterModal extensionFilter={extensionFilter} onChange={setExtensionFilter} />

        <div className="relative flex items-center" ref={dotDropRef}>
          <button
            onClick={() => setHideDot(!hideDot)}
            className={`rounded-l px-2 py-1 text-xs transition-colors ${
              hideDot
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
            }`}
          >
            隐藏.*
          </button>
          <button
            onClick={() => setDotDropOpen(!dotDropOpen)}
            className={`rounded-r border-l px-1.5 py-1 text-xs transition-colors ${
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
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-700 ${
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
    </>
  )
}
