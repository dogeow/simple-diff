import { ChevronDown, ChevronRight, EllipsisVertical, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { StatusDot, type StatusDotProps } from './badge'
import { IconButton } from './button'
import { ContextMenu, DropdownMenu } from './menu'
import type { MenuItem, Tone } from './types'

const ICON_TONE: Record<Tone, string> = {
  neutral: 'text-fg-muted',
  accent: 'text-accent-text',
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
  running: 'text-running-text',
  idle: 'text-fg-subtle',
}

export interface TreeRowProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect' | 'onContextMenu' | 'children'> {
  depth: number
  label: React.ReactNode
  icon?: LucideIcon
  iconTone?: Tone
  expandable?: boolean
  expanded?: boolean
  onToggle?: () => void
  selected?: boolean
  status?: StatusDotProps['status']
  /** Right-aligned counts / size / age. */
  meta?: React.ReactNode
  badges?: React.ReactNode
  /** Leading slot, between the chevron and the icon — a diff sign column, a checkbox. */
  leading?: React.ReactNode
  /** Revealed on hover AND focus-within — never hover-only. */
  actions?: React.ReactNode
  /** Persistent `⋯` so the hover actions stay discoverable. */
  overflow?: MenuItem[]
  /** `Enter` / `Space`, and a plain click when `onSelect` is not supplied. */
  onActivate?: () => void
  /**
   * Single click. When present it takes the click over `onActivate`, so a tree
   * whose click means "select" (with Shift/⌘ ranges) can still keep
   * `Enter`/`Space` as "open".
   */
  onSelect?: (event: React.MouseEvent) => void
  onContextMenu?: () => MenuItem[]
  guides?: boolean
  className?: string
  /** ARIA level is 1-based; `depth` is 0-based. */
  setSize?: number
  posInSet?: number
  /**
   * Roving tabIndex owner. Selection is a multi-row concept, focus is not, so a
   * multi-select tree drives the single tab stop with this instead of `selected`.
   */
  focused?: boolean
}

export function TreeRow({
  depth,
  label,
  icon: Icon,
  iconTone = 'neutral',
  expandable,
  expanded,
  onToggle,
  selected,
  status,
  meta,
  badges,
  leading,
  actions,
  overflow,
  onActivate,
  onSelect,
  onContextMenu,
  guides = true,
  className,
  setSize,
  posInSet,
  focused,
  ...rest
}: TreeRowProps) {
  const Chevron = expanded ? ChevronDown : ChevronRight

  const row = (
    <div
      {...rest}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={expandable ? Boolean(expanded) : undefined}
      aria-selected={selected}
      aria-setsize={setSize}
      aria-posinset={posInSet}
      tabIndex={(focused ?? selected) ? 0 : -1}
      data-focus-inset
      onClick={onSelect ?? onActivate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onActivate?.()
        } else if (event.key === 'ArrowRight' && expandable && !expanded) {
          event.preventDefault()
          onToggle?.()
        } else if (event.key === 'ArrowLeft' && expandable && expanded) {
          event.preventDefault()
          onToggle?.()
        }
      }}
      style={{ paddingLeft: depth * 12 + 8 }}
      className={cn(
        'group relative flex h-row-tree items-center gap-1.5 pr-1 text-sm',
        'transition-colors duration-[120ms]',
        selected ? 'bg-selected text-fg' : 'text-fg hover:bg-hover',
        className,
      )}
    >
      {selected ? <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-accent" /> : null}
      {guides && depth > 0 ? (
        <span aria-hidden className="absolute inset-y-0 w-px bg-border" style={{ left: depth * 12 + 1 }} />
      ) : null}
      {expandable ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={(event) => {
            event.stopPropagation()
            onToggle?.()
          }}
          className="shrink-0 rounded-xs text-fg-subtle hover:text-fg"
        >
          <Chevron aria-hidden size={12} strokeWidth={1.75} />
        </button>
      ) : (
        <span aria-hidden className="w-3 shrink-0" />
      )}
      {leading}
      {status ? <StatusDot status={status} /> : null}
      {Icon ? <Icon aria-hidden size={12} strokeWidth={1.75} className={cn('shrink-0', ICON_TONE[iconTone])} /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badges}
      {meta ? <span className="shrink-0 text-xs text-fg-muted tabular-nums">{meta}</span> : null}
      {actions ? (
        <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex group-focus-within:flex">
          {actions}
        </span>
      ) : null}
      {overflow?.length ? (
        <DropdownMenu
          items={overflow}
          trigger={
            <IconButton
              icon={EllipsisVertical}
              label="行操作"
              size="xs"
              variant="ghost"
              onClick={(event) => event.stopPropagation()}
            />
          }
        />
      ) : null}
    </div>
  )

  if (!onContextMenu) return row
  return <ContextMenu items={() => onContextMenu()}>{row}</ContextMenu>
}
