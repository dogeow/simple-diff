import { Check, ChevronDown, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { useDismiss, useFloating, usePortal } from './_internal/hooks'
import { createPortal } from 'react-dom'
import { Spinner } from './feedback'
import { Input } from './input'

export interface ComboboxProps<T> {
  items: T[]
  value: T | null
  onValueChange: (v: T | null) => void
  itemKey: (t: T) => string
  renderItem: (t: T, state: { active: boolean; selected: boolean }) => React.ReactNode
  /** Defaults to a case-insensitive match against `itemKey`. */
  filter?: (t: T, q: string) => boolean
  groupBy?: (t: T) => string
  placeholder?: string
  emptyMessage?: React.ReactNode
  size?: 'sm' | 'md'
  clearable?: boolean
  loading?: boolean
  className?: string
  'aria-label': string
}

/** > 12 options, or anything searchable / grouped. */
export function Combobox<T>({
  items,
  value,
  onValueChange,
  itemKey,
  renderItem,
  filter,
  groupBy,
  placeholder = '搜索…',
  emptyMessage = '无匹配项',
  size = 'md',
  clearable = true,
  loading,
  className,
  'aria-label': ariaLabel,
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const floatingRef = useRef<HTMLDivElement | null>(null)
  const portalTarget = usePortal()

  useDismiss(floatingRef, { onDismiss: () => setOpen(false), enabled: open })
  const style = useFloating(anchorRef, floatingRef, {
    placement: 'bottom',
    align: 'start',
    matchTriggerWidth: true,
    enabled: open,
  })

  const matched = useMemo(() => {
    if (!query.trim()) return items
    const test = filter ?? ((item: T, q: string) => itemKey(item).toLowerCase().includes(q.toLowerCase()))
    return items.filter((item) => test(item, query))
  }, [items, query, filter, itemKey])

  const sections = useMemo(() => {
    if (!groupBy) return [{ group: '', items: matched }]
    const map = new Map<string, T[]>()
    for (const item of matched) {
      const key = groupBy(item)
      const list = map.get(key)
      if (list) list.push(item)
      else map.set(key, [item])
    }
    return Array.from(map.entries()).map(([group, groupItems]) => ({ group, items: groupItems }))
  }, [matched, groupBy])

  const selectedKey = value ? itemKey(value) : null
  let cursor = -1

  return (
    <div ref={anchorRef} className={cn('relative', className)}>
      <div className="flex items-center gap-1">
        <Input
          size={size}
          value={open ? query : (selectedKey ?? '')}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-expanded={open}
          role="combobox"
          aria-controls={`${ariaLabel}-listbox`}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setOpen(true)
              setActiveIndex((index) => (matched.length === 0 ? 0 : (index + 1) % matched.length))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((index) => (matched.length === 0 ? 0 : (index - 1 + matched.length) % matched.length))
            } else if (event.key === 'Enter' && open) {
              event.preventDefault()
              const item = matched[activeIndex]
              if (item) {
                onValueChange(item)
                setOpen(false)
                setQuery('')
              }
            } else if (event.key === 'Escape') {
              setOpen(false)
            }
          }}
          wrapperClassName="flex-1"
          trailing={
            loading ? (
              <Spinner size="xs" />
            ) : (
              <span className="flex items-center">
                {clearable && value ? (
                  <button
                    type="button"
                    aria-label="清除选择"
                    onClick={() => onValueChange(null)}
                    className="rounded-xs p-0.5 text-fg-subtle hover:text-fg"
                  >
                    <X aria-hidden size={12} strokeWidth={1.75} />
                  </button>
                ) : null}
                <ChevronDown aria-hidden size={14} strokeWidth={1.75} className="text-fg-subtle" />
              </span>
            )
          }
        />
      </div>
      {open && portalTarget
        ? createPortal(
            <div
              ref={floatingRef}
              id={`${ariaLabel}-listbox`}
              role="listbox"
              aria-label={ariaLabel}
              style={{
                position: 'fixed',
                top: style?.top ?? -9999,
                left: style?.left ?? -9999,
                minWidth: style?.minWidth,
                visibility: style ? 'visible' : 'hidden',
              }}
              className="z-popover max-h-64 overflow-y-auto rounded-lg border border-border-strong bg-raised p-1 shadow-raised"
            >
              {matched.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-fg-muted">{emptyMessage}</p>
              ) : (
                sections.map((section) => (
                  <div key={section.group || 'default'}>
                    {section.group ? (
                      <div className="px-2 pt-1.5 pb-0.5 text-2xs font-medium text-fg-subtle">{section.group}</div>
                    ) : null}
                    {section.items.map((item) => {
                      cursor += 1
                      const index = cursor
                      const active = index === activeIndex
                      const selected = selectedKey === itemKey(item)
                      return (
                        <button
                          key={itemKey(item)}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          data-focus-inset
                          onMouseMove={() => setActiveIndex(index)}
                          onClick={() => {
                            onValueChange(item)
                            setOpen(false)
                            setQuery('')
                          }}
                          className={cn(
                            'flex h-control-sm w-full items-center gap-1.5 rounded-sm px-2 text-left text-sm text-fg',
                            active && 'bg-hover',
                          )}
                        >
                          <Check
                            aria-hidden
                            size={12}
                            strokeWidth={1.75}
                            className={cn('text-accent-text', !selected && 'invisible')}
                          />
                          <span className="min-w-0 flex-1 truncate">{renderItem(item, { active, selected })}</span>
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>,
            portalTarget,
          )
        : null}
    </div>
  )
}
