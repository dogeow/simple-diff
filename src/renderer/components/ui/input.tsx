import { Search, X, type LucideIcon } from 'lucide-react'
import { forwardRef, useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { IconButton } from './button'

export const inputBase =
  'w-full rounded-md border bg-inset text-fg placeholder:text-fg-subtle ' +
  'transition-[border-color,box-shadow] duration-[120ms] ' +
  'border-border hover:border-border-strong ' +
  'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'aria-invalid:border-danger aria-invalid:outline-danger'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md'
  invalid?: boolean
  /** Paths, globs, SQL. */
  mono?: boolean
  leading?: LucideIcon | React.ReactNode
  trailing?: React.ReactNode
  wrapperClassName?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, wrapperClassName, size = 'md', invalid, mono, leading, trailing, ...rest },
  ref,
) {
  const Lead = typeof leading === 'function' ? (leading as LucideIcon) : null
  const pad = size === 'sm' ? 'h-control-sm text-xs' : 'h-control-md text-sm'
  return (
    <div className={cn('relative flex items-center', wrapperClassName)}>
      {leading ? (
        <span className="pointer-events-none absolute left-2 flex text-fg-subtle">
          {Lead ? <Lead size={14} strokeWidth={1.75} aria-hidden /> : (leading as React.ReactNode)}
        </span>
      ) : null}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          inputBase,
          pad,
          mono && 'font-mono',
          leading ? 'pl-7' : 'pl-2',
          trailing ? 'pr-7' : 'pr-2',
          className,
        )}
        {...rest}
      />
      {trailing ? <span className="absolute right-1 flex items-center">{trailing}</span> : null}
    </div>
  )
})

export interface SearchInputProps extends Omit<InputProps, 'leading' | 'trailing' | 'value' | 'onChange'> {
  value: string
  onValueChange: (v: string) => void
  debounceMs?: number
  /** Esc clears first, then blurs. */
  clearable?: boolean
  count?: number
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onValueChange, debounceMs = 0, clearable = true, count, onKeyDown, ...rest },
  ref,
) {
  const [draft, setDraft] = useState(value)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => setDraft(value), [value])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const push = (next: string) => {
    setDraft(next)
    if (debounceMs <= 0) {
      onValueChange(next)
      return
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onValueChange(next), debounceMs)
  }

  return (
    <Input
      ref={ref}
      type="search"
      value={draft}
      leading={Search}
      onChange={(event) => push(event.target.value)}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.key === 'Escape' && clearable) {
          if (draft) {
            event.stopPropagation()
            push('')
          } else {
            event.currentTarget.blur()
          }
        }
      }}
      trailing={
        <span className="flex items-center gap-1">
          {typeof count === 'number' ? (
            <span className="text-2xs text-fg-subtle tabular-nums">{count}</span>
          ) : null}
          {clearable && draft ? (
            <IconButton
              icon={X}
              label="清除"
              size="xs"
              variant="ghost"
              onClick={() => push('')}
            />
          ) : null}
        </span>
      }
      {...rest}
    />
  )
})

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
  mono?: boolean
  resize?: 'none' | 'vertical'
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, mono, rows = 8, resize = 'vertical', ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        inputBase,
        'px-2 py-1.5 text-sm',
        mono && 'font-mono',
        resize === 'none' ? 'resize-none' : 'resize-y',
        className,
      )}
      {...rest}
    />
  )
})
