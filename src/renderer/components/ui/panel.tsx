import { EllipsisVertical, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { IconButton } from './button'
import { ProgressBar, type ProgressState } from './feedback'
import { DropdownMenu } from './menu'
import type { MenuItem, Tone } from './types'

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'flat' | 'bordered' | 'inset'
  header?: React.ReactNode
  footer?: React.ReactNode
  padded?: boolean
  /** `danger` = the Danger Zone treatment. */
  tone?: 'default' | 'danger'
}

export function Panel({
  variant = 'bordered',
  header,
  footer,
  padded = true,
  tone = 'default',
  className,
  children,
  ...rest
}: PanelProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-lg',
        variant === 'bordered' && 'border border-border bg-surface',
        variant === 'inset' && 'border border-border bg-inset',
        variant === 'flat' && 'bg-surface',
        tone === 'danger' && 'border-danger/40 bg-danger-quiet',
        className,
      )}
      {...rest}
    >
      {header ? (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium text-fg">
          {header}
        </div>
      ) : null}
      <div className={cn('min-h-0 flex-1', padded && 'p-3')}>{children}</div>
      {footer ? <div className="border-t border-border px-3 py-2">{footer}</div> : null}
    </div>
  )
}

export interface StatTileProps {
  label: React.ReactNode
  value: React.ReactNode
  icon?: LucideIcon
  hint?: React.ReactNode
  delta?: { value: React.ReactNode; direction: 'up' | 'down' | 'flat'; tone?: Tone }
  size?: 'sm' | 'md'
  onClick?: () => void
  className?: string
}

const DELTA_TONE: Record<Tone, string> = {
  neutral: 'text-fg-muted',
  accent: 'text-accent-text',
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
  running: 'text-running-text',
  idle: 'text-fg-muted',
}

export function StatTile({ label, value, icon: Icon, hint, delta, size = 'sm', onClick, className }: StatTileProps) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-xs text-fg-muted">
        {Icon ? <Icon aria-hidden size={14} strokeWidth={1.75} /> : null}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn('font-medium text-fg tabular-nums', size === 'sm' ? 'text-xl' : 'text-2xl')}>{value}</span>
        {delta ? (
          <span className={cn('inline-flex items-center gap-1 text-xs', DELTA_TONE[delta.tone ?? 'neutral'])}>
            {delta.direction === 'up'
              ? <TrendingUp aria-hidden size={12} strokeWidth={1.75} />
              : delta.direction === 'down'
                ? <TrendingDown aria-hidden size={12} strokeWidth={1.75} />
                : <span aria-hidden>—</span>}
            {delta.value}
          </span>
        ) : null}
      </div>
      {hint ? <span className="truncate text-xs text-fg-subtle">{hint}</span> : null}
    </>
  )

  const shared = cn('flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 text-left', className)
  if (!onClick) return <div className={shared}>{body}</div>
  return (
    <button type="button" onClick={onClick} className={cn(shared, 'transition-colors duration-[120ms] hover:bg-hover')}>
      {body}
    </button>
  )
}

export interface ToolbarProps {
  title?: React.ReactNode
  /** Path, row count — mono where it is a literal. */
  subtitle?: React.ReactNode
  icon?: LucideIcon
  /** High-frequency only; ~4 controls max. Everything else -> `overflow`. */
  actions?: React.ReactNode
  overflow?: MenuItem[]
  /** Second row; wraps as a ToggleGroup chips row. */
  filters?: React.ReactNode
  /** Renders a 2px ProgressBar on the toolbar's bottom edge — zero layout cost. */
  progress?: ProgressState | null
  sticky?: boolean
  className?: string
}

export function Toolbar({
  title,
  subtitle,
  icon: Icon,
  actions,
  overflow,
  filters,
  progress,
  sticky = true,
  className,
}: ToolbarProps) {
  return (
    <div
      className={cn(
        'relative shrink-0 border-b border-border bg-surface',
        sticky && 'sticky top-0 z-chrome',
        className,
      )}
    >
      <div className="flex h-toolbar items-center gap-1.5 px-2">
        {Icon ? <Icon size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-fg-muted" /> : null}
        <div className="flex min-w-0 items-baseline gap-2">
          {title ? <h1 className="truncate text-sm font-semibold text-fg">{title}</h1> : null}
          {subtitle ? <span className="truncate text-xs text-fg-muted">{subtitle}</span> : null}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {actions}
          {overflow?.length ? (
            <DropdownMenu
              items={overflow}
              trigger={<IconButton icon={EllipsisVertical} label="更多操作" size="sm" variant="ghost" />}
            />
          ) : null}
        </div>
      </div>
      {filters ? (
        <div className="flex flex-wrap items-center gap-1 border-t border-border px-2 py-1">{filters}</div>
      ) : null}
      {progress ? <ProgressBar {...progress} variant="line" className="absolute inset-x-0 bottom-0" /> : null}
    </div>
  )
}
