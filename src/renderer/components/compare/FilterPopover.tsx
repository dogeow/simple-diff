import { useEffect, useState } from 'react'
import { Filter } from 'lucide-react'
import { formatPathFiltersForDisplay, mergeDisplayedPathFilters } from '@shared/path-filter'
import { Button, Popover, Textarea } from '../ui'
import { cn } from '../../lib/utils'

export interface FilterPopoverProps {
  readonly extensionFilter: readonly string[]
  readonly onChange: (filter: readonly string[]) => void | Promise<void>
  /** Controlled so `⌘F` can open it and focus the textarea. */
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
  /** Overridden by the setup panel, which spells the action out ("编辑过滤…"). */
  readonly label?: string
  readonly size?: 'xs' | 'sm'
}

/**
 * 蓝图 chunk 6 第 4 条：`FilterModal.tsx` 的手写 popover（自带一份 mousedown
 * 外点关闭 effect、没有视口夹取、没有 `role="dialog"`）换成共享 `Popover`。
 *
 * 挂载点只有一个——结果态在工具栏筛选行，setup 态在设置面板，两者互斥。
 *
 * 这里没有用 `RuleEditor`：那个原语是 allow/block 一对 glob 列表，而本应用的过滤
 * 模型只有排除一侧（`shared/path-filter.ts` 全是 exclude 语义，没有 allow 概念），
 * 硬塞一个 allow 文本框只会得到一个输入即丢弃的死控件。
 */
export default function FilterPopover({
  extensionFilter,
  onChange,
  open: openProp,
  onOpenChange,
  label,
  size = 'sm',
}: FilterPopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = openProp ?? uncontrolledOpen
  const [draft, setDraft] = useState('')

  const setOpen = (next: boolean) => {
    if (openProp === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  // 每次打开都从当前规则重新灌入，取消编辑后不会留下上一次的残稿。
  useEffect(() => {
    if (!open) return
    setDraft(formatPathFiltersForDisplay(extensionFilter).join('\n'))
  }, [open, extensionFilter])

  const active = extensionFilter.length > 0
  const triggerLabel = label ?? (active ? `过滤 (${extensionFilter.length})` : '过滤')

  const handleApply = () => {
    void onChange(mergeDisplayedPathFilters(draft.split('\n'), extensionFilter))
    setOpen(false)
  }

  const handleClear = () => {
    setDraft('')
    void onChange([])
    setOpen(false)
  }

  return (
    <Popover
      aria-label="路径过滤规则"
      open={open}
      onOpenChange={setOpen}
      className="w-72 p-3"
      trigger={
        <Button
          size={size}
          variant="ghost"
          icon={Filter}
          aria-pressed={active}
          className={cn(active && 'border border-accent/40 bg-accent-quiet text-accent-text')}
        >
          {triggerLabel}
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="compare-session-filter" className="text-xs font-medium text-fg-muted">
          排除目录或路径
        </label>
        <p className="text-2xs text-fg-subtle">一行一个；右键『忽略』会自动写入精确路径规则</p>
        <Textarea
          id="compare-session-filter"
          autoFocus
          mono
          rows={6}
          resize="none"
          spellCheck={false}
          value={draft}
          placeholder={'node_modules\n.git\ndist'}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="flex gap-2">
          <Button variant="primary" size="sm" fullWidth onClick={handleApply}>
            应用
          </Button>
          <Button variant="secondary" size="sm" fullWidth onClick={handleClear}>
            清除
          </Button>
        </div>
      </div>
    </Popover>
  )
}
