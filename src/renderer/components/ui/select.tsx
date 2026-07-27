import { ChevronDown } from 'lucide-react'
import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  group?: string
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: SelectOption[]
  size?: 'sm' | 'md'
  invalid?: boolean
  /** Renders a disabled, selected-by-default option. */
  placeholder?: string
  wrapperClassName?: string
}

/** Themed native `<select>` — correct for <= 12 flat options; keeps OS keyboard behaviour. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, size = 'md', invalid, placeholder, className, wrapperClassName, ...rest },
  ref,
) {
  const groups = options.reduce<Map<string, SelectOption[]>>((acc, option) => {
    const key = option.group ?? ''
    const list = acc.get(key)
    if (list) list.push(option)
    else acc.set(key, [option])
    return acc
  }, new Map())

  return (
    <div className={cn('relative flex items-center', wrapperClassName)}>
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'w-full appearance-none rounded-md border border-border bg-inset pr-7 pl-2 text-fg',
          'transition-[border-color] duration-[120ms] hover:border-border-strong',
          'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring',
          'disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger',
          size === 'sm' ? 'h-control-sm text-xs' : 'h-control-md text-sm',
          className,
        )}
        {...rest}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {Array.from(groups.entries()).map(([group, items]) =>
          group ? (
            <optgroup key={group} label={group}>
              {items.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ) : (
            items.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))
          ),
        )}
      </select>
      <ChevronDown
        aria-hidden
        size={14}
        strokeWidth={1.75}
        className="pointer-events-none absolute right-2 text-fg-subtle"
      />
    </div>
  )
})
