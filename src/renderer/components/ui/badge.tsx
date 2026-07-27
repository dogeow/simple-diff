import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { StatusTone, Tone } from './types'

const TONE: Record<Tone, { quiet: string; solid: string; outline: string }> = {
  neutral: {
    quiet: 'bg-surface-2 text-fg-muted border-border',
    solid: 'bg-fg-muted text-surface border-transparent',
    outline: 'text-fg-muted border-border',
  },
  accent: {
    quiet: 'bg-accent-quiet text-accent-text border-accent/30',
    solid: 'bg-accent text-accent-fg border-transparent',
    outline: 'text-accent-text border-accent/50',
  },
  success: {
    quiet: 'bg-success-quiet text-success-text border-success/30',
    solid: 'bg-success text-surface border-transparent',
    outline: 'text-success-text border-success/50',
  },
  warning: {
    quiet: 'bg-warning-quiet text-warning-text border-warning/30',
    solid: 'bg-warning text-surface border-transparent',
    outline: 'text-warning-text border-warning/50',
  },
  danger: {
    quiet: 'bg-danger-quiet text-danger-text border-danger/30',
    solid: 'bg-danger text-danger-fg border-transparent',
    outline: 'text-danger-text border-danger/50',
  },
  running: {
    quiet: 'bg-running-quiet text-running-text border-running/30',
    solid: 'bg-running text-accent-fg border-transparent',
    outline: 'text-running-text border-running/50',
  },
  idle: {
    quiet: 'bg-idle-quiet text-fg-muted border-border',
    solid: 'bg-idle text-surface border-transparent',
    outline: 'text-fg-muted border-border',
  },
}

const DOT_TONE: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  running: 'bg-running',
  idle: 'bg-idle',
}

export interface StatusDotProps {
  status: StatusTone
  /** sm = 6px, md = 8px */
  size?: 'sm' | 'md'
  /** When present, renders dot + text instead of a bare decorative dot. */
  label?: React.ReactNode
  pulse?: boolean
  className?: string
}

export function StatusDot({
  status,
  size = 'sm',
  label,
  pulse = status === 'running',
  className,
}: StatusDotProps) {
  const dot = (
    <span
      data-status={status}
      aria-hidden
      className={cn(
        'inline-block shrink-0 rounded-full',
        size === 'sm' ? 'size-1.5' : 'size-2',
        DOT_TONE[status],
        pulse && 'animate-pulse-dot',
        !label && className,
      )}
    />
  )
  if (!label) return dot
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-fg-muted', className)}>
      {dot}
      {label}
    </span>
  )
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  size?: 'xs' | 'sm'
  icon?: LucideIcon
  /** Leading StatusDot instead of an icon. */
  dot?: boolean
  variant?: 'quiet' | 'solid' | 'outline'
}

const STATUS_FOR_TONE: Partial<Record<Tone, StatusTone>> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  running: 'running',
  idle: 'idle',
  neutral: 'idle',
  accent: 'running',
}

export function Badge({
  tone = 'neutral',
  size = 'sm',
  icon: Icon,
  dot,
  variant = 'quiet',
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border font-medium whitespace-nowrap',
        size === 'xs' ? 'h-4 px-1 text-2xs' : 'h-5 px-1.5 text-xs',
        TONE[tone][variant],
        className,
      )}
      {...rest}
    >
      {dot ? <StatusDot status={STATUS_FOR_TONE[tone] ?? 'idle'} /> : null}
      {Icon ? <Icon aria-hidden strokeWidth={1.75} className="size-3" /> : null}
      {children}
    </span>
  )
}

const IS_MAC =
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode
}

/** `Mod` renders ⌘ on macOS and Ctrl elsewhere. */
export function Kbd({ children, className, ...rest }: KbdProps) {
  const text = typeof children === 'string' ? children.replace(/\bMod\b/g, IS_MAC ? '⌘' : 'Ctrl') : children
  return (
    <kbd
      className={cn(
        'inline-flex h-4 min-w-4 items-center justify-center rounded-xs border border-border',
        'bg-surface-2 px-1 font-mono text-2xs text-fg-muted',
        className,
      )}
      {...rest}
    >
      {text}
    </kbd>
  )
}
