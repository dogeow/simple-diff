import { cloneElement, isValidElement, useEffect, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'
import { useFloating, type Side } from './_internal/hooks'

// One module-level timer shared by every tooltip, so moving along a toolbar
// shows the second tooltip instantly (DESIGN-SYSTEM §6 / PRIMITIVES §10).
let sharedTimer: number | undefined
let lastShownAt = 0

export interface TooltipProps {
  content: React.ReactNode
  side?: Side
  delayMs?: number
  disabled?: boolean
  children: ReactElement
  /**
   * Anything else is forwarded verbatim to the child. `Tooltip` renders a
   * Fragment, so without this a `Popover`/`DropdownMenu` that clones its
   * trigger (`ref`, `onClick`, `aria-expanded`) would attach those props to
   * `Tooltip` itself and they would be silently dropped — which is exactly what
   * `<DropdownMenu trigger={<IconButton …/>} />` does.
   */
  [key: string]: unknown
}

type ForwardedRef = React.Ref<HTMLElement> | undefined

function assignRef(ref: ForwardedRef, node: HTMLElement | null): void {
  if (typeof ref === 'function') {
    ref(node)
    return
  }
  if (ref && typeof ref === 'object') {
    ;(ref as React.MutableRefObject<HTMLElement | null>).current = node
  }
}

export function Tooltip({
  content,
  side = 'bottom',
  delayMs = 400,
  disabled,
  children,
  ...forwarded
}: TooltipProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLElement | null>(null)
  const floatingRef = useRef<HTMLDivElement | null>(null)
  const style = useFloating(anchorRef, floatingRef, { placement: side, align: 'center', offset: 6, enabled: open })

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => () => window.clearTimeout(sharedTimer), [])

  const show = () => {
    if (disabled) return
    window.clearTimeout(sharedTimer)
    const delay = Date.now() - lastShownAt < 300 ? 0 : delayMs
    sharedTimer = window.setTimeout(() => {
      lastShownAt = Date.now()
      setOpen(true)
    }, delay)
  }
  const hide = () => {
    window.clearTimeout(sharedTimer)
    setOpen(false)
  }

  if (!isValidElement(children)) return children

  const props = children.props as {
    onMouseEnter?: (e: React.MouseEvent) => void
    onMouseLeave?: (e: React.MouseEvent) => void
    onFocus?: (e: React.FocusEvent) => void
    onBlur?: (e: React.FocusEvent) => void
  }

  const { ref: forwardedRef, ...restProps } = forwarded as { ref?: ForwardedRef } & Record<string, unknown>
  // The child may already carry a ref (`IconButton` hands its own forwarded ref
  // to `Button`). Overwriting it would silently break every consumer that needs
  // the DOM node — e.g. a `DropdownMenu` anchoring on an `IconButton` trigger.
  const childRef = (children as ReactElement<{ ref?: ForwardedRef }>).props?.ref

  const node = cloneElement(children as ReactElement<Record<string, unknown>>, {
    ...restProps,
    ref: (element: HTMLElement | null) => {
      anchorRef.current = element
      assignRef(childRef, element)
      assignRef(forwardedRef, element)
    },
    onMouseEnter: (event: React.MouseEvent) => {
      props.onMouseEnter?.(event)
      show()
    },
    onMouseLeave: (event: React.MouseEvent) => {
      props.onMouseLeave?.(event)
      hide()
    },
    onFocus: (event: React.FocusEvent) => {
      props.onFocus?.(event)
      show()
    },
    onBlur: (event: React.FocusEvent) => {
      props.onBlur?.(event)
      hide()
    },
  })

  return (
    <>
      {node}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={floatingRef}
              role="tooltip"
              style={{
                position: 'fixed',
                top: style?.top ?? -9999,
                left: style?.left ?? -9999,
                visibility: style ? 'visible' : 'hidden',
              }}
              className={cn(
                'pointer-events-none z-tooltip flex items-center rounded-md border border-border-strong',
                'bg-raised px-1.5 py-1 text-xs text-fg shadow-raised',
              )}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
