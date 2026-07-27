import type { LucideIcon } from 'lucide-react'
import { cloneElement, forwardRef, isValidElement, useEffect, useId, useRef, type ReactElement } from 'react'
import { cn } from '../../lib/utils'

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  size?: 'sm' | 'md'
  /** Grid select-all needs this; a plain checkbox cannot express it. */
  indeterminate?: boolean
  label?: React.ReactNode
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { size = 'md', indeterminate, label, className, id, ...rest },
  ref,
) {
  const inner = useRef<HTMLInputElement | null>(null)
  const autoId = useId()
  const inputId = id ?? autoId

  useEffect(() => {
    if (inner.current) inner.current.indeterminate = Boolean(indeterminate)
  }, [indeterminate])

  const input = (
    <input
      ref={(node) => {
        inner.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
      id={inputId}
      type="checkbox"
      className={cn(
        'shrink-0 cursor-pointer rounded-xs border border-border-strong bg-inset',
        'accent-accent transition-colors duration-[120ms]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'size-3' : 'size-3.5',
        className,
      )}
      {...rest}
    />
  )

  if (!label) return input
  return (
    <label htmlFor={inputId} className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-fg">
      {input}
      {label}
    </label>
  )
})

export interface SwitchProps {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  size?: 'sm' | 'md'
  label?: React.ReactNode
  description?: React.ReactNode
  disabled?: boolean
  className?: string
  id?: string
}

/** Immediate-effect boolean only. Never inside a form with a Save button. */
export function Switch({
  checked,
  onCheckedChange,
  size = 'md',
  label,
  description,
  disabled,
  className,
  id,
}: SwitchProps) {
  const autoId = useId()
  const switchId = id ?? autoId
  const track = size === 'sm' ? 'h-4 w-7' : 'h-[18px] w-8'
  const knob = size === 'sm' ? 'size-3' : 'size-3.5'
  const shift = size === 'sm' ? 'translate-x-3' : 'translate-x-3.5'

  const control = (
    <button
      id={switchId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={typeof label === 'string' ? label : undefined}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full border border-border p-0.5',
        'transition-colors duration-[120ms] disabled:pointer-events-none disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-surface-2',
        track,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'rounded-full transition-transform duration-[120ms]',
          checked ? cn('bg-accent-fg', shift) : 'translate-x-0 bg-fg-muted',
          knob,
        )}
      />
    </button>
  )

  if (!label && !description) return control
  return (
    <div className="flex items-start gap-2">
      {control}
      <div className="min-w-0">
        <label htmlFor={switchId} className="block cursor-pointer text-sm text-fg">
          {label}
        </label>
        {description ? <p className="text-xs text-fg-muted">{description}</p> : null}
      </div>
    </div>
  )
}

export interface RadioGroupProps<T extends string> {
  value: T
  onValueChange: (v: T) => void
  options: { value: T; label: React.ReactNode; description?: React.ReactNode; icon?: LucideIcon }[]
  variant?: 'list' | 'segmented'
  name: string
  size?: 'sm' | 'md'
  className?: string
  'aria-label'?: string
}

export function RadioGroup<T extends string>({
  value,
  onValueChange,
  options,
  variant = 'list',
  name,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: RadioGroupProps<T>) {
  if (variant === 'segmented') {
    return (
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className={cn(
          'inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5',
          className,
        )}
      >
        {options.map((option) => {
          const selected = option.value === value
          const Icon = option.icon
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onValueChange(option.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-sm px-2 font-medium transition-colors duration-[120ms]',
                size === 'sm' ? 'h-control-xs text-2xs' : 'h-control-sm text-xs',
                selected ? 'bg-surface text-fg shadow-raised' : 'text-fg-muted hover:bg-hover hover:text-fg',
              )}
            >
              {Icon ? <Icon aria-hidden size={14} strokeWidth={1.75} /> : null}
              {option.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('flex flex-col gap-1.5', className)}>
      {options.map((option) => (
        <label key={option.value} className="flex cursor-pointer items-start gap-2 text-sm text-fg">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onValueChange(option.value)}
            className="mt-0.5 size-3.5 accent-accent"
          />
          <span className="min-w-0">
            {option.label}
            {option.description ? <span className="block text-xs text-fg-muted">{option.description}</span> : null}
          </span>
        </label>
      ))}
    </div>
  )
}

export interface FieldProps {
  label: React.ReactNode
  htmlFor?: string
  hint?: React.ReactNode
  error?: React.ReactNode
  required?: boolean
  orientation?: 'vertical' | 'horizontal'
  className?: string
  children: React.ReactNode
}

/** Label + control + hint/error, wired with `aria-describedby`. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  orientation = 'vertical',
  className,
  children,
}: FieldProps) {
  const auto = useId()
  const id = htmlFor ?? auto
  const msgId = `${id}-msg`

  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        'aria-describedby': hint || error ? msgId : undefined,
        'aria-invalid': error ? true : undefined,
      })
    : children

  return (
    <div
      className={cn(
        'gap-1',
        orientation === 'vertical'
          ? 'flex flex-col'
          : 'grid grid-cols-[140px_1fr] items-center gap-x-3',
        className,
      )}
    >
      <label htmlFor={id} className="text-xs font-medium text-fg-muted">
        {label}
        {required ? <span className="ml-0.5 text-danger-text">*</span> : null}
      </label>
      {control}
      {hint || error ? (
        <p id={msgId} className={cn('text-xs', error ? 'text-danger-text' : 'text-fg-subtle')}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  )
}
