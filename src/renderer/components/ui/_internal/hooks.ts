// Doge Desktop Design System — shared primitive internals.
// Contracts: PRIMITIVES.md "Shared internals".
import { useCallback, useEffect, useRef, useState } from 'react'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

/**
 * Trap focus inside `ref` while `active`, and restore the previously focused
 * element on deactivate. Also marks the container `aria-modal`.
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  initialFocus?: React.RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return
    const container = ref.current
    if (!container) return

    const previous = document.activeElement as HTMLElement | null
    const target = initialFocus?.current ?? getFocusable(container)[0] ?? container
    if (!container.hasAttribute('tabindex') && target === container) {
      container.setAttribute('tabindex', '-1')
    }
    target.focus({ preventScroll: true })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = getFocusable(container)
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const activeEl = document.activeElement as HTMLElement | null
      if (event.shiftKey && (activeEl === first || !container.contains(activeEl))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previous?.focus?.({ preventScroll: true })
    }
  }, [ref, active, initialFocus])
}

export interface DismissOptions {
  onDismiss: () => void
  outside?: boolean
  escape?: boolean
  enabled?: boolean
}

/**
 * Every enabled dismissable surface, oldest first. Only the last entry reacts —
 * layers portal to `document.body`, so a nested dialog is *not* contained by the
 * one below it and would otherwise dismiss it on the very click that opened or
 * answered it (a Cancel press inside a `ConfirmDialog` used to close its host
 * `Dialog` too). Same reason `Escape` peels exactly one layer: DESIGN-SYSTEM §8.1
 * "dismiss the topmost layer: popover → dialog → palette".
 */
const dismissLayers: symbol[] = []

/** One outside-click / Escape implementation for every floating surface. */
export function useDismiss(
  ref: React.RefObject<HTMLElement | null>,
  { onDismiss, outside = true, escape = true, enabled = true }: DismissOptions,
): void {
  const handler = useRef(onDismiss)
  handler.current = onDismiss

  useEffect(() => {
    if (!enabled) return

    const layer = Symbol('dismiss-layer')
    dismissLayers.push(layer)
    const isTopLayer = () => dismissLayers[dismissLayers.length - 1] === layer

    const onPointerDown = (event: MouseEvent) => {
      if (!isTopLayer()) return
      const node = ref.current
      if (!node) return
      if (node.contains(event.target as Node)) return
      handler.current()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (!isTopLayer()) return
      event.stopPropagation()
      handler.current()
    }

    if (outside) document.addEventListener('mousedown', onPointerDown, true)
    if (escape) document.addEventListener('keydown', onKeyDown)
    return () => {
      const index = dismissLayers.indexOf(layer)
      if (index >= 0) dismissLayers.splice(index, 1)
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [ref, outside, escape, enabled])
}

export type Side = 'top' | 'right' | 'bottom' | 'left'
export type Align = 'start' | 'center' | 'end'

export interface FloatingOptions {
  placement?: Side
  align?: Align
  offset?: number
  anchorPoint?: { x: number; y: number } | null
  matchTriggerWidth?: boolean
  enabled?: boolean
}

export interface FloatingStyle {
  top: number
  left: number
  minWidth?: number
}

const VIEWPORT_MARGIN = 8

/**
 * Position a floating element against an anchor rect (or a raw point) with real
 * viewport clamping — replaces every hand-rolled clamper in the three apps.
 */
export function useFloating(
  anchorRef: React.RefObject<HTMLElement | null>,
  floatingRef: React.RefObject<HTMLElement | null>,
  {
    placement = 'bottom',
    align = 'start',
    offset = 4,
    anchorPoint = null,
    matchTriggerWidth = false,
    enabled = true,
  }: FloatingOptions = {},
): FloatingStyle | null {
  const [style, setStyle] = useState<FloatingStyle | null>(null)

  const compute = useCallback(() => {
    const floating = floatingRef.current
    if (!floating) return
    const rect = anchorPoint
      ? new DOMRect(anchorPoint.x, anchorPoint.y, 0, 0)
      : anchorRef.current?.getBoundingClientRect()
    if (!rect) return

    const width = floating.offsetWidth
    const height = floating.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight

    let top = 0
    let left = 0
    if (placement === 'bottom' || placement === 'top') {
      const below = rect.bottom + offset
      const above = rect.top - offset - height
      top = placement === 'bottom' ? below : above
      if (top + height > vh - VIEWPORT_MARGIN && above >= VIEWPORT_MARGIN) top = above
      if (top < VIEWPORT_MARGIN && below + height <= vh - VIEWPORT_MARGIN) top = below
      left =
        align === 'start' ? rect.left : align === 'end' ? rect.right - width : rect.left + rect.width / 2 - width / 2
    } else {
      const after = rect.right + offset
      const before = rect.left - offset - width
      left = placement === 'right' ? after : before
      if (left + width > vw - VIEWPORT_MARGIN && before >= VIEWPORT_MARGIN) left = before
      if (left < VIEWPORT_MARGIN && after + width <= vw - VIEWPORT_MARGIN) left = after
      top =
        align === 'start' ? rect.top : align === 'end' ? rect.bottom - height : rect.top + rect.height / 2 - height / 2
    }

    left = Math.min(Math.max(VIEWPORT_MARGIN, left), Math.max(VIEWPORT_MARGIN, vw - width - VIEWPORT_MARGIN))
    top = Math.min(Math.max(VIEWPORT_MARGIN, top), Math.max(VIEWPORT_MARGIN, vh - height - VIEWPORT_MARGIN))

    setStyle({
      top: Math.round(top),
      left: Math.round(left),
      minWidth: matchTriggerWidth ? Math.round(rect.width) : undefined,
    })
  }, [anchorRef, floatingRef, placement, align, offset, anchorPoint, matchTriggerWidth])

  useEffect(() => {
    if (!enabled) {
      setStyle(null)
      return
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [enabled, compute])

  return style
}

/** One tab stop per group; arrows move within it. */
export function useRovingTabIndex(count: number, activeIndex: number) {
  const [focusIndex, setFocusIndex] = useState(activeIndex)

  useEffect(() => {
    setFocusIndex(activeIndex)
  }, [activeIndex])

  const move = useCallback(
    (delta: number | 'first' | 'last') => {
      setFocusIndex((current) => {
        if (count === 0) return 0
        if (delta === 'first') return 0
        if (delta === 'last') return count - 1
        return (current + delta + count) % count
      })
    },
    [count],
  )

  return { focusIndex, setFocusIndex, move }
}

/**
 * Portal target. Defaults to `document.body`, but a Popover rendered inside a
 * Dialog receives the dialog element so it inherits that stacking context
 * (DESIGN-SYSTEM §4).
 */
export function usePortal(container?: HTMLElement | null): HTMLElement | null {
  const [node, setNode] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setNode(container ?? (typeof document === 'undefined' ? null : document.body))
  }, [container])
  return node
}

/** Controlled / uncontrolled duality. */
export function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (v: T) => void,
): [T, (v: T) => void] {
  const [uncontrolled, setUncontrolled] = useState<T>(defaultValue)
  const isControlled = value !== undefined
  const current = isControlled ? value : uncontrolled
  const set = useCallback(
    (next: T) => {
      if (!isControlled) setUncontrolled(next)
      onChange?.(next)
    },
    [isControlled, onChange],
  )
  return [current, set]
}

/** Returns true once `delayMs` has elapsed while `active` — skeleton gating. */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!active) {
      setReady(false)
      return
    }
    const timer = window.setTimeout(() => setReady(true), delayMs)
    return () => window.clearTimeout(timer)
  }, [active, delayMs])
  return ready
}
