import {
  cloneElement,
  isValidElement,
  useCallback,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'
import { useControllable, useDismiss, useFloating, usePortal, type Align, type Side } from './_internal/hooks'

export interface PopoverProps {
  open?: boolean
  onOpenChange?: (o: boolean) => void
  trigger: ReactElement
  side?: Side
  align?: Align
  offset?: number
  /** Pointer-anchored (ContextMenu). */
  anchorPoint?: { x: number; y: number } | null
  matchTriggerWidth?: boolean
  /** A Popover inside a Dialog passes the dialog element so it inherits its stacking context. */
  container?: HTMLElement | null
  className?: string
  'aria-label'?: string
  children: React.ReactNode
}

export function Popover({
  open: openProp,
  onOpenChange,
  trigger,
  side = 'bottom',
  align = 'start',
  offset = 4,
  anchorPoint = null,
  matchTriggerWidth = false,
  container,
  className,
  'aria-label': ariaLabel,
  children,
}: PopoverProps) {
  const [open, setOpen] = useControllable(openProp, false, onOpenChange)
  const anchorRef = useRef<HTMLElement | null>(null)
  const floatingRef = useRef<HTMLDivElement | null>(null)
  const portalTarget = usePortal(container)

  const close = useCallback(() => setOpen(false), [setOpen])
  useDismiss(floatingRef, { onDismiss: close, enabled: open })

  const style = useFloating(anchorRef, floatingRef, {
    placement: side,
    align,
    offset,
    anchorPoint,
    matchTriggerWidth,
    enabled: open,
  })

  const triggerNode = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<Record<string, unknown>>, {
        ref: anchorRef,
        'aria-expanded': open,
        'aria-haspopup': 'dialog',
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
              role="dialog"
              aria-label={ariaLabel}
              style={{
                position: 'fixed',
                top: style?.top ?? -9999,
                left: style?.left ?? -9999,
                minWidth: style?.minWidth,
                visibility: style ? 'visible' : 'hidden',
              }}
              className={cn(
                'z-popover rounded-lg border border-border-strong bg-raised p-1 shadow-raised',
                className,
              )}
            >
              {children}
            </div>,
            portalTarget,
          )
        : null}
    </>
  )
}

/** Imperative popover state for callers that own the trigger themselves. */
export function usePopoverState(initial = false) {
  const [open, setOpen] = useState(initial)
  return {
    open,
    setOpen,
    toggle: useCallback(() => setOpen((v) => !v), []),
    close: useCallback(() => setOpen(false), []),
  }
}
