import { CircleX, MousePointerClick, SearchX, Sparkles, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Kbd } from './badge'

export type EmptyStateVariant = 'first-run' | 'no-selection' | 'no-results' | 'error'

const DEFAULT_ICON: Record<EmptyStateVariant, LucideIcon> = {
  'first-run': Sparkles,
  'no-selection': MousePointerClick,
  'no-results': SearchX,
  error: CircleX,
}

export interface EmptyStateProps {
  variant?: EmptyStateVariant
  icon?: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  /** REQUIRED — an empty state without a way out is a dead end. */
  action: React.ReactNode
  secondaryAction?: React.ReactNode
  shortcut?: string
  error?: unknown
  /** `sm` fits inside a panel, `md` fills a view. */
  size?: 'sm' | 'md'
  className?: string
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.message}\n${error.stack ?? ''}`
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error, null, 2)
  } catch {
    return String(error)
  }
}

export function EmptyState({
  variant = 'first-run',
  icon,
  title,
  description,
  action,
  secondaryAction,
  shortcut,
  error,
  size = 'md',
  className,
}: EmptyStateProps) {
  const Icon = icon ?? DEFAULT_ICON[variant]
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 text-center',
        size === 'sm' ? 'p-4' : 'min-h-0 flex-1 p-8',
        className,
      )}
    >
      <Icon
        aria-hidden
        size={20}
        strokeWidth={1.75}
        className={variant === 'error' ? 'text-danger-text' : 'text-fg-subtle'}
      />
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="max-w-md text-xs text-fg-muted">{description}</p> : null}
      <div className="mt-1 flex items-center gap-2">
        {action}
        {secondaryAction}
      </div>
      {shortcut ? (
        <p className="text-xs text-fg-subtle">
          或按 <Kbd>{shortcut}</Kbd>
        </p>
      ) : null}
      {variant === 'error' && error !== undefined ? (
        <details className="mt-1 max-w-full text-left">
          <summary className="cursor-pointer text-xs text-fg-muted">错误详情</summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded-md border border-border bg-inset p-2 font-mono text-2xs whitespace-pre-wrap text-fg-muted">
            {describeError(error)}
          </pre>
        </details>
      ) : null}
    </div>
  )
}
