import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { SlidersHorizontal } from 'lucide-react'
import type { CompareFilter, CompareStats, StrategyName } from '../../../../shared/types'
import { useCompareStore } from '../../stores/compare-store'
import { useSessionFilterChange } from '../../hooks/useSessionFilterChange'
import { Button, Popover, ToggleGroup, type ToggleGroupOption } from '../ui'
import { cn } from '../../lib/utils'
import FilterPopover from './FilterPopover'
import StrategyChips from './StrategyChips'

type StatKey = keyof CompareStats | 'pending' | 'paired'

const FILTERS: readonly { value: CompareFilter; label: string; statKey: StatKey }[] = [
  { value: 'all', label: '全部', statKey: 'total' },
  { value: 'paired', label: '双方', statKey: 'paired' },
  { value: 'different', label: '不同', statKey: 'different' },
  { value: 'left_only', label: '仅左', statKey: 'leftOnly' },
  { value: 'right_only', label: '仅右', statKey: 'rightOnly' },
  { value: 'equal', label: '相同', statKey: 'equal' },
  { value: 'unresolved', label: '待比', statKey: 'pending' },
]

function getFilterStatValue(statKey: StatKey, stats: CompareStats, pendingCount: number): number {
  if (statKey === 'pending') return pendingCount
  if (statKey === 'paired') return Math.max(0, stats.total - stats.leftOnly - stats.rightOnly)
  return stats[statKey]
}

export interface CompareFiltersProps {
  /** Controlled by the toolbar so `⌘F` can focus the rule editor. */
  readonly filterPopoverOpen: boolean
  readonly onFilterPopoverOpenChange: (open: boolean) => void
  readonly onOpenStrategyDoc: () => void
}

/**
 * 蓝图 §4.3 的 26px 筛选行：7 个结果筛选片 + `过滤 (n) ▾` + `比较依据 (n) ▾`。
 *
 * 从旧 `CompareToolbar` 那个 11 控件双行块里拆出来的高频那一半；剩下的（视图、
 * 隐藏点文件、展开全部、交换左右）全部下沉到工具栏的 `⋯`（F5）。
 * 计数在流式扫描时活更新，所以整行包在 `aria-live="polite"` 里，同时每个筛选片
 * 用固定的 `ariaLabel`，避免可访问名字随计数一起抖动。
 */
export default function CompareFilters({
  filterPopoverOpen,
  onFilterPopoverOpenChange,
  onOpenStrategyDoc,
}: CompareFiltersProps) {
  const onSessionFilterChange = useSessionFilterChange()
  const {
    filter,
    setFilter,
    entrySummary,
    entryCount,
    done,
    strategies,
    setStrategies,
    extensionFilter,
  } = useCompareStore(useShallow((state) => ({
    filter: state.filter,
    setFilter: state.setFilter,
    entrySummary: state.entrySummary,
    entryCount: state.entries.length,
    done: state.done,
    strategies: state.strategies,
    setStrategies: state.setStrategies,
    extensionFilter: state.extensionFilter,
  })))

  const { stats, pendingCount } = entrySummary
  const hasComparedResult = done || pendingCount > 0 || entryCount > 0

  const options = useMemo<ToggleGroupOption<CompareFilter>[]>(
    () => FILTERS.map(({ value, label, statKey }) => {
      const count = getFilterStatValue(statKey, stats, pendingCount)
      // 对比还没跑过时，一排 0 只是噪声；`待比 0` 任何时候都不值得占位。
      const hideCount = count === 0 && (!hasComparedResult || statKey === 'pending')
      return { value, label, ariaLabel: label, count: hideCount ? undefined : count }
    }),
    [hasComparedResult, pendingCount, stats],
  )

  const handleToggleStrategy = useCallback((strategy: StrategyName) => {
    const next = [...strategies]
    const index = next.indexOf(strategy)
    if (index >= 0) next.splice(index, 1)
    else next.push(strategy)
    setStrategies(next)
  }, [setStrategies, strategies])

  const missingStrategies = strategies.length === 0

  return (
    <>
      <div aria-live="polite" className="flex min-w-0 flex-wrap items-center gap-1">
        <ToggleGroup
          aria-label="结果筛选"
          variant="chips"
          size="sm"
          value={filter}
          onValueChange={setFilter}
          options={options}
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <FilterPopover
          extensionFilter={extensionFilter}
          onChange={onSessionFilterChange}
          open={filterPopoverOpen}
          onOpenChange={onFilterPopoverOpenChange}
        />

        <Popover
          aria-label="比较依据"
          className="w-72 p-3"
          trigger={
            <Button
              size="sm"
              variant="ghost"
              icon={SlidersHorizontal}
              title={missingStrategies ? '至少选择一个比较依据' : undefined}
              className={cn(missingStrategies && 'text-warning-text')}
            >
              比较依据 ({strategies.length})
            </Button>
          }
        >
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-fg-muted">用哪些依据判断“不同”</span>
            <StrategyChips strategies={strategies} onToggle={handleToggleStrategy} />
            {missingStrategies ? (
              <p className="text-xs text-warning-text">至少选择一个比较依据，否则无法开始对比。</p>
            ) : null}
            <div className="flex justify-end border-t border-border pt-2">
              <Button variant="link" size="sm" onClick={onOpenStrategyDoc}>
                策略说明…
              </Button>
            </div>
          </div>
        </Popover>
      </div>
    </>
  )
}
