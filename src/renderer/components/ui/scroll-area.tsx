import { forwardRef, useEffect, useRef } from 'react'
import { cn } from '../../lib/utils'

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'vertical' | 'both'
  /** Persists `scrollTop` in sessionStorage under this key. */
  restoreKey?: string
  onReachEnd?: () => void
  viewportRef?: React.RefObject<HTMLDivElement | null>
}

/**
 * Owns exactly one scroll region and exposes its viewport ref. This is what
 * removes the need for `document.querySelector('.content')`-style coupling.
 */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { orientation = 'vertical', restoreKey, onReachEnd, viewportRef, className, children, onScroll, ...rest },
  ref,
) {
  const inner = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = inner.current
    if (!node || !restoreKey) return
    const saved = sessionStorage.getItem(`ds-scroll:${restoreKey}`)
    if (saved) node.scrollTop = Number(saved)
    return () => {
      sessionStorage.setItem(`ds-scroll:${restoreKey}`, String(node.scrollTop))
    }
  }, [restoreKey])

  return (
    <div
      ref={(node) => {
        inner.current = node
        if (viewportRef) viewportRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
      onScroll={(event) => {
        onScroll?.(event)
        if (!onReachEnd) return
        const el = event.currentTarget
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) onReachEnd()
      }}
      className={cn('min-h-0 flex-1', orientation === 'both' ? 'overflow-auto' : 'overflow-y-auto', className)}
      {...rest}
    >
      {children}
    </div>
  )
})
