import type { StrategyName } from '../../../../shared/types'
import { cn } from '../../lib/utils'
import { Check } from 'lucide-react'

export interface StrategyOption {
  readonly value: StrategyName
  readonly label: string
  readonly hint: string
}

/** 唯一一份比较依据文案。旧代码在 HomePage 和 CompareToolbar 各写了一份。 */
export const STRATEGY_OPTIONS: readonly StrategyOption[] = [
  { value: 'size', label: '文件大小', hint: '快速但仅判断大小' },
  { value: 'mtime', label: '修改时间', hint: '比对最后修改时间' },
  { value: 'quick_hash', label: '快速内容签名', hint: '抽样 hash，权衡速度与准确性' },
  { value: 'hash', label: '内容哈希', hint: '完整 SHA，最准确但最慢' },
]

export interface StrategyChipsProps {
  readonly strategies: readonly StrategyName[]
  readonly onToggle: (strategy: StrategyName) => void
  readonly size?: 'xs' | 'sm'
  readonly className?: string
}

/**
 * 多选筛选片。`ToggleGroup` 是单选的（`value: T`），所以这里保留独立实现，
 * 但视觉与 `ToggleGroup variant="chips"` 完全一致，并带 `aria-pressed`。
 * 蓝图 §4.2：setup 面板与 chunk 6 的「比较依据 ▾」弹层共用这一份实现。
 */
export default function StrategyChips({ strategies, onToggle, size = 'sm', className }: StrategyChipsProps) {
  return (
    <div role="group" aria-label="比较依据" className={cn('flex flex-wrap items-center gap-1', className)}>
      {STRATEGY_OPTIONS.map((option) => {
        const active = strategies.includes(option.value)

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            title={option.hint}
            onClick={() => onToggle(option.value)}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border font-medium whitespace-nowrap',
              'transition-colors duration-[120ms]',
              size === 'xs' ? 'h-control-xs px-1.5 text-2xs' : 'h-control-sm px-2 text-xs',
              active
                ? 'border-accent/40 bg-accent-quiet text-accent-text'
                : 'border-border bg-surface text-fg-muted hover:bg-hover hover:text-fg',
            )}
          >
            {active ? <Check aria-hidden size={size === 'xs' ? 12 : 14} strokeWidth={1.75} /> : null}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
