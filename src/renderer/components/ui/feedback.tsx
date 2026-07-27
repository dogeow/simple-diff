import { Loader2, Square } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useDelayedFlag } from './_internal/hooks'
import { IconButton } from './button'
import type { JobStatus } from './types'

export interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md'
  label?: string
  className?: string
}

const SPINNER_SIZE = { xs: 'size-3', sm: 'size-3.5', md: 'size-4' } as const

export function Spinner({ size = 'sm', label, className }: SpinnerProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-fg-muted', className)}>
      <Loader2
        aria-hidden
        strokeWidth={1.75}
        className={cn('animate-spin-slow', SPINNER_SIZE[size])}
      />
      {label ? <span className="text-xs">{label}</span> : <span className="sr-only">加载中</span>}
    </span>
  )
}

export interface SkeletonProps {
  variant?: 'text' | 'row' | 'tile'
  count?: number
  /** Nothing renders before this; a sub-300ms flash is worse than nothing. */
  delayMs?: number
  className?: string
}

const SKELETON_SHAPE = {
  text: 'h-3 w-full rounded-sm',
  row: 'h-row-grid w-full rounded-sm',
  tile: 'h-16 w-full rounded-lg',
} as const

export function Skeleton({ variant = 'text', count = 1, delayMs = 300, className }: SkeletonProps) {
  const ready = useDelayedFlag(true, delayMs)
  if (!ready) return null
  return (
    <div aria-hidden className={cn('flex flex-col gap-1.5', className)}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={cn('animate-pulse bg-surface-2', SKELETON_SHAPE[variant])} />
      ))}
    </div>
  )
}

export interface ProgressState {
  status: JobStatus
  /** 0..1; absent while running => indeterminate. */
  value?: number
  label?: React.ReactNode
  /** Current file / step — mono, truncated. */
  detail?: React.ReactNode
  count?: { done: number; total?: number }
  onCancel?: () => void
}

export interface ProgressBarProps extends ProgressState {
  /** `bar` = 6px with labels; `line` = the 2px variant pinned under a Toolbar. */
  variant?: 'bar' | 'line'
  className?: string
}

const FILL_TONE: Record<JobStatus, string> = {
  idle: 'bg-idle',
  queued: 'bg-idle',
  running: 'bg-running',
  done: 'bg-success',
  error: 'bg-danger',
  cancelled: 'bg-idle',
}

export function ProgressBar({
  status,
  value,
  label,
  detail,
  count,
  onCancel,
  variant = 'bar',
  className,
}: ProgressBarProps) {
  const indeterminate = status === 'running' && typeof value !== 'number'
  const pct = typeof value === 'number' ? Math.min(100, Math.max(0, value * 100)) : 100

  const track = (
    <div
      role="progressbar"
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : 100}
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      aria-busy={status === 'running' || undefined}
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-surface-2',
        variant === 'line' ? 'h-0.5 rounded-none bg-transparent' : 'h-1.5',
      )}
    >
      <div
        data-indeterminate={indeterminate ? 'true' : undefined}
        className={cn(
          'h-full rounded-full',
          FILL_TONE[status],
          indeterminate ? 'w-full animate-indeterminate' : 'transition-[width] duration-[180ms]',
        )}
        style={indeterminate ? undefined : { width: `${pct}%` }}
      />
    </div>
  )

  if (variant === 'line') return <div className={className}>{track}</div>

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label || detail || count || onCancel ? (
        <div className="flex items-center gap-2" aria-live="polite">
          {label ? <span className="truncate text-xs text-fg">{label}</span> : null}
          {count ? (
            <span className="shrink-0 text-2xs text-fg-muted tabular-nums">
              {count.done}
              {typeof count.total === 'number' ? ` / ${count.total}` : ''}
            </span>
          ) : null}
          {detail ? (
            <span className="min-w-0 flex-1 truncate font-mono text-2xs text-fg-subtle">{detail}</span>
          ) : null}
          {onCancel ? (
            <IconButton
              icon={Square}
              label="取消"
              size="xs"
              variant="danger-ghost"
              className="ml-auto"
              onClick={onCancel}
            />
          ) : null}
        </div>
      ) : null}
      {track}
    </div>
  )
}
