import { Check, ChevronRight } from 'lucide-react'
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'
import { useDismiss, useFloating, usePortal, type Align, type Side } from './_internal/hooks'
import { Kbd } from './badge'
import type { MenuItem } from './types'

/**
 * Insert a separator before the first `danger` item when the author did not.
 * `FileContextMenu.tsx` already does this by hand and is the model.
 */
export function withDangerSeparator(items: MenuItem[]): MenuItem[] {
  const firstDanger = items.findIndex((item) => (item.kind ?? 'item') === 'item' && 'danger' in item && item.danger)
  if (firstDanger <= 0) return items
  const previous = items[firstDanger - 1]
  if (previous.kind === 'separator') return items
  return [
    ...items.slice(0, firstDanger),
    { kind: 'separator', id: `auto-sep-${firstDanger}` },
    ...items.slice(firstDanger),
  ]
}

function isSelectable(item: MenuItem): boolean {
  const kind = item.kind ?? 'item'
  if (kind === 'separator' || kind === 'label') return false
  if ('disabled' in item && item.disabled) return false
  return true
}

interface MenuListProps {
  items: MenuItem[]
  onClose: () => void
  labelledBy?: string
}

function MenuList({ items, onClose, labelledBy }: MenuListProps) {
  const resolved = useMemo(() => withDangerSeparator(items), [items])
  const selectable = useMemo(
    () => resolved.map((item, index) => ({ item, index })).filter(({ item }) => isSelectable(item)),
    [resolved],
  )
  const [activeIndex, setActiveIndex] = useState(0)
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
  const typeahead = useRef({ query: '', at: 0 })

  const move = useCallback(
    (delta: number | 'first' | 'last') => {
      setActiveIndex((current) => {
        if (selectable.length === 0) return 0
        if (delta === 'first') return 0
        if (delta === 'last') return selectable.length - 1
        return (current + delta + selectable.length) % selectable.length
      })
    },
    [selectable.length],
  )

  const activate = (item: MenuItem) => {
    const kind = item.kind ?? 'item'
    if (kind === 'submenu') {
      setOpenSubmenu((current) => (current === item.id ? null : item.id))
      return
    }
    if (kind === 'item' || kind === 'checkbox') {
      ;(item as { onSelect: () => void }).onSelect()
      onClose()
    }
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        move(1)
        return
      case 'ArrowUp':
        event.preventDefault()
        move(-1)
        return
      case 'Home':
        event.preventDefault()
        move('first')
        return
      case 'End':
        event.preventDefault()
        move('last')
        return
      case 'Enter':
      case ' ': {
        event.preventDefault()
        const entry = selectable[activeIndex]
        if (entry) activate(entry.item)
        return
      }
      default:
        break
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      const now = Date.now()
      typeahead.current.query = now - typeahead.current.at > 800 ? event.key : typeahead.current.query + event.key
      typeahead.current.at = now
      const query = typeahead.current.query.toLowerCase()
      const found = selectable.findIndex(({ item }) =>
        String((item as { label?: unknown }).label ?? '')
          .toLowerCase()
          .startsWith(query),
      )
      if (found >= 0) setActiveIndex(found)
    }
  }

  return (
    <div role="menu" aria-labelledby={labelledBy} tabIndex={-1} data-focus-inset onKeyDown={onKeyDown} className="min-w-44">
      {resolved.map((item, index) => {
        const kind = item.kind ?? 'item'
        if (kind === 'separator') return <div key={item.id} role="separator" className="my-1 h-px bg-border" />
        if (kind === 'label') {
          return (
            <div key={item.id} className="px-2 py-1 text-2xs font-medium text-fg-subtle">
              {(item as { label: React.ReactNode }).label}
            </div>
          )
        }

        const position = selectable.findIndex((entry) => entry.index === index)
        const active = position === activeIndex
        const disabled = 'disabled' in item ? item.disabled : false
        const danger = kind === 'item' && 'danger' in item ? item.danger : false
        const Icon = 'icon' in item ? item.icon : undefined
        const checked = kind === 'checkbox' ? (item as { checked: boolean }).checked : undefined
        const shortcut = kind === 'item' && 'shortcut' in item ? item.shortcut : undefined
        const hint = kind === 'item' && 'hint' in item ? item.hint : undefined

        if (kind === 'submenu') {
          const submenu = item as Extract<MenuItem, { kind: 'submenu' }>
          const expanded = openSubmenu === submenu.id
          return (
            <div key={submenu.id}>
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={expanded}
                data-focus-inset
                onMouseEnter={() => setActiveIndex(position)}
                onClick={() => activate(submenu)}
                className={cn(
                  'flex h-control-sm w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-fg',
                  active ? 'bg-hover' : 'hover:bg-hover',
                )}
              >
                {Icon ? <Icon aria-hidden size={14} strokeWidth={1.75} className="text-fg-muted" /> : null}
                <span className="min-w-0 flex-1 truncate">{submenu.label}</span>
                <ChevronRight aria-hidden size={14} strokeWidth={1.75} className="text-fg-subtle" />
              </button>
              {expanded ? (
                <div className="ml-3 border-l border-border pl-1">
                  <MenuList items={submenu.items} onClose={onClose} />
                </div>
              ) : null}
            </div>
          )
        }

        return (
          <button
            key={item.id}
            type="button"
            role={kind === 'checkbox' ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={kind === 'checkbox' ? checked : undefined}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            data-focus-inset
            onMouseEnter={() => !disabled && setActiveIndex(position)}
            onClick={() => activate(item)}
            className={cn(
              'flex h-control-sm w-full items-center gap-2 rounded-sm px-2 text-left text-sm',
              danger ? 'text-danger-text' : 'text-fg',
              disabled && 'pointer-events-none opacity-50',
              active ? (danger ? 'bg-danger-quiet' : 'bg-hover') : danger ? 'hover:bg-danger-quiet' : 'hover:bg-hover',
            )}
          >
            {kind === 'checkbox' ? (
              <Check
                aria-hidden
                size={14}
                strokeWidth={1.75}
                className={cn('text-accent-text', !checked && 'invisible')}
              />
            ) : Icon ? (
              <Icon aria-hidden size={14} strokeWidth={1.75} className={danger ? 'text-danger-text' : 'text-fg-muted'} />
            ) : null}
            <span className="min-w-0 flex-1 truncate">{(item as { label: React.ReactNode }).label}</span>
            {hint ? <span className="shrink-0 text-2xs text-fg-subtle">{hint}</span> : null}
            {shortcut ? <Kbd>{shortcut}</Kbd> : null}
          </button>
        )
      })}
    </div>
  )
}

export interface DropdownMenuProps {
  items: MenuItem[]
  trigger: ReactElement
  side?: Side
  align?: Align
  offset?: number
  container?: HTMLElement | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DropdownMenu({
  items,
  trigger,
  side = 'bottom',
  align = 'end',
  offset = 4,
  container,
  open: openProp,
  onOpenChange,
}: DropdownMenuProps) {
  const [uncontrolled, setUncontrolled] = useState(false)
  const open = openProp ?? uncontrolled
  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange],
  )

  const anchorRef = useRef<HTMLElement | null>(null)
  const floatingRef = useRef<HTMLDivElement | null>(null)
  const portalTarget = usePortal(container)
  const close = useCallback(() => setOpen(false), [setOpen])

  useDismiss(floatingRef, { onDismiss: close, enabled: open })
  const style = useFloating(anchorRef, floatingRef, { placement: side, align, offset, enabled: open })

  useEffect(() => {
    if (open) floatingRef.current?.querySelector<HTMLElement>('[role="menu"]')?.focus()
  }, [open])

  const triggerNode = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<Record<string, unknown>>, {
        ref: anchorRef,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        onClick: (event: React.MouseEvent) => {
          const original = (trigger.props as { onClick?: (e: React.MouseEvent) => void }).onClick
          original?.(event)
          if (!event.defaultPrevented) setOpen(!open)
        },
      })
    : trigger

  return (
    <>
      {triggerNode}
      {open && portalTarget
        ? createPortal(
            <div
              ref={floatingRef}
              style={{
                position: 'fixed',
                top: style?.top ?? -9999,
                left: style?.left ?? -9999,
                visibility: style ? 'visible' : 'hidden',
              }}
              className="z-popover rounded-lg border border-border-strong bg-raised p-1 shadow-raised"
            >
              <MenuList items={items} onClose={close} />
            </div>,
            portalTarget,
          )
        : null}
    </>
  )
}

export interface ContextMenuProps {
  items: MenuItem[] | ((event: React.MouseEvent) => MenuItem[])
  children: ReactElement
  disabled?: boolean
  container?: HTMLElement | null
}

/** `DropdownMenu` opened at the pointer. */
export function ContextMenu({ items, children, disabled, container }: ContextMenuProps) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const [resolved, setResolved] = useState<MenuItem[]>([])
  const floatingRef = useRef<HTMLDivElement | null>(null)
  const anchorRef = useRef<HTMLElement | null>(null)
  const portalTarget = usePortal(container)
  const close = useCallback(() => setPoint(null), [])

  useDismiss(floatingRef, { onDismiss: close, enabled: point !== null })
  const style = useFloating(anchorRef, floatingRef, {
    placement: 'bottom',
    align: 'start',
    offset: 0,
    anchorPoint: point,
    enabled: point !== null,
  })

  useEffect(() => {
    if (point) floatingRef.current?.querySelector<HTMLElement>('[role="menu"]')?.focus()
  }, [point])

  if (!isValidElement(children)) return children

  const node = cloneElement(children as ReactElement<Record<string, unknown>>, {
    onContextMenu: (event: React.MouseEvent) => {
      const original = (children.props as { onContextMenu?: (e: React.MouseEvent) => void }).onContextMenu
      original?.(event)
      if (disabled || event.defaultPrevented) return
      event.preventDefault()
      setResolved(typeof items === 'function' ? items(event) : items)
      setPoint({ x: event.clientX, y: event.clientY })
    },
  })

  return (
    <>
      {node}
      {point && portalTarget
        ? createPortal(
            <div
              ref={floatingRef}
              style={{
                position: 'fixed',
                top: style?.top ?? -9999,
                left: style?.left ?? -9999,
                visibility: style ? 'visible' : 'hidden',
              }}
              className="z-popover rounded-lg border border-border-strong bg-raised p-1 shadow-raised"
            >
              <MenuList items={resolved} onClose={close} />
            </div>,
            portalTarget,
          )
        : null}
    </>
  )
}
