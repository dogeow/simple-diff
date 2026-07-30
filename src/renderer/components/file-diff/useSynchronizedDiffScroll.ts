import { useCallback, useEffect, useRef, useState } from 'react'

export type DiffSide = 'left' | 'right'

export function useSynchronizedDiffScroll(active: boolean) {
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  const handleScroll = useCallback((source: DiffSide) => {
    if (syncingRef.current) return

    const from = source === 'left' ? leftRef.current : rightRef.current
    const to = source === 'left' ? rightRef.current : leftRef.current
    if (!from || !to) return

    syncingRef.current = true
    setScrollTop(from.scrollTop)
    to.scrollTop = from.scrollTop
    requestAnimationFrame(() => {
      syncingRef.current = false
    })
  }, [])

  useEffect(() => {
    if (!active) return

    const element = leftRef.current
    if (!element) return

    const updateViewport = () => {
      setViewportHeight(element.clientHeight)
      setScrollTop(element.scrollTop)
    }

    updateViewport()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(updateViewport)
    observer.observe(element)
    return () => observer.disconnect()
  }, [active])

  return {
    leftRef,
    rightRef,
    scrollTop,
    viewportHeight,
    handleScroll,
  }
}
