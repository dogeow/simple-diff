import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2, type LucideIcon } from 'lucide-react'
import { forwardRef } from 'react'
import { cn } from '../../lib/utils'
import { Kbd } from './badge'
import { Tooltip } from './tooltip'
import type { ControlSize, Side } from './types'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost' | 'link'

const button = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium ' +
    'transition-colors duration-[120ms] select-none ' +
    'disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active',
        secondary:
          'border border-border bg-surface text-fg hover:bg-hover hover:border-border-strong active:bg-active',
        ghost: 'text-fg-muted hover:bg-hover hover:text-fg active:bg-active',
        danger: 'bg-danger text-danger-fg hover:brightness-110 active:brightness-95',
        'danger-ghost': 'text-danger-text hover:bg-danger-quiet',
        link: 'text-accent-text underline-offset-4 hover:underline px-0',
      },
      size: {
        xs: 'h-control-xs px-1.5 text-2xs [&_svg]:size-3',
        sm: 'h-control-sm px-2 text-xs [&_svg]:size-3.5',
        md: 'h-control-md px-2.5 text-sm [&_svg]:size-3.5',
        lg: 'h-control-lg px-3.5 text-sm [&_svg]:size-4',
      },
      fullWidth: { true: 'w-full' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

/**
 * DESIGN-SYSTEM §6 的字号：12 在 `xs` 控件里，14 是默认（配 13px 正文），16 在 `lg` 里。
 * 类名（`[&_svg]:size-*`）负责渲染尺寸，`size` 属性负责让 SVG 自身的 `width/height`
 * 说的是同一件事——否则 DOM 里留下的永远是 lucide 的默认 24。
 */
const ICON_SIZE: Record<ControlSize, number> = { xs: 12, sm: 14, md: 14, lg: 16 }

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    Omit<VariantProps<typeof button>, 'variant' | 'size'> {
  variant?: ButtonVariant
  size?: ControlSize
  /** Leading icon; replaced by a Spinner while `loading`. */
  icon?: LucideIcon
  trailingIcon?: LucideIcon
  /** Sets `aria-busy`. Deliberately does NOT disable — a cancellable action stays clickable. */
  loading?: boolean
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, icon: Icon, trailingIcon: Trailing, loading, fullWidth, children, type, ...rest },
  ref,
) {
  const Lead = loading ? Loader2 : Icon
  const iconSize = ICON_SIZE[size ?? 'md']
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-busy={loading || undefined}
      className={cn(button({ variant, size, fullWidth }), className)}
      {...rest}
    >
      {Lead ? (
        <Lead aria-hidden size={iconSize} strokeWidth={1.75} className={loading ? 'animate-spin-slow' : undefined} />
      ) : null}
      {children}
      {Trailing && !loading ? <Trailing aria-hidden size={iconSize} strokeWidth={1.75} /> : null}
    </button>
  )
})

export interface IconButtonProps extends Omit<ButtonProps, 'icon' | 'children' | 'fullWidth'> {
  icon: LucideIcon
  /** REQUIRED — becomes both `aria-label` and the tooltip content. */
  label: string
  tooltip?: boolean
  tooltipSide?: Side
  shortcut?: string
  /** Toggle-button pressed state. */
  active?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, tooltip = true, tooltipSide = 'bottom', shortcut, active, size = 'md', className, ...rest },
  ref,
) {
  const btn = (
    <Button
      ref={ref}
      size={size}
      aria-label={label}
      aria-pressed={active}
      className={cn('aspect-square px-0', active && 'bg-selected text-fg', className)}
      {...rest}
    >
      <Icon aria-hidden size={ICON_SIZE[size]} strokeWidth={1.75} />
    </Button>
  )
  if (!tooltip) return btn
  return (
    <Tooltip
      side={tooltipSide}
      content={
        <>
          {label}
          {shortcut ? <Kbd className="ml-1.5">{shortcut}</Kbd> : null}
        </>
      }
    >
      {btn}
    </Tooltip>
  )
})
