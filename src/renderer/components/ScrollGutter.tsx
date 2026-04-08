import { useState, useEffect, useCallback, useRef } from 'react'

export interface GutterMarker {
  /** 0–1, position ratio from top */
  readonly start: number
  /** 0–1, height ratio */
  readonly height: number
}

interface ScrollGutterProps {
  readonly scrollRef: React.RefObject<HTMLElement | null>
  readonly markers?: readonly GutterMarker[]
}

export default function ScrollGutter({ scrollRef, markers }: ScrollGutterProps) {
  const gutterRef = useRef<HTMLDivElement>(null)
  const [thumbTop, setThumbTop] = useState(0)
  const [thumbHeight, setThumbHeight] = useState(0)
  const [visible, setVisible] = useState(false)
  const dragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartScroll = useRef(0)

  const updateThumb = useCallback(() => {
    const el = scrollRef.current
    const gutter = gutterRef.current
    if (!el || !gutter) return

    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight <= clientHeight) {
      setVisible(false)
      return
    }

    setVisible(true)
    const gutterHeight = gutter.clientHeight
    const ratio = clientHeight / scrollHeight
    const height = Math.max(ratio * gutterHeight, 24)
    const top = (scrollTop / (scrollHeight - clientHeight)) * (gutterHeight - height)
    setThumbHeight(height)
    setThumbTop(top)
  }, [scrollRef])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    el.addEventListener('scroll', updateThumb, { passive: true })
    const observer = new ResizeObserver(updateThumb)
    observer.observe(el)

    updateThumb()

    return () => {
      el.removeEventListener('scroll', updateThumb)
      observer.disconnect()
    }
  }, [scrollRef, updateThumb])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const el = scrollRef.current
    if (!el) return

    dragging.current = true
    dragStartY.current = e.clientY
    dragStartScroll.current = el.scrollTop

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const gutter = gutterRef.current
      if (!gutter || !el) return

      const deltaY = ev.clientY - dragStartY.current
      const gutterHeight = gutter.clientHeight
      const { scrollHeight, clientHeight } = el
      const scrollRange = scrollHeight - clientHeight
      const gutterRange = gutterHeight - thumbHeight

      if (gutterRange <= 0) return
      el.scrollTop = dragStartScroll.current + (deltaY / gutterRange) * scrollRange
    }

    const handleMouseUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [scrollRef, thumbHeight])

  const handleGutterClick = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current
    const gutter = gutterRef.current
    if (!el || !gutter) return

    const rect = gutter.getBoundingClientRect()
    const clickY = e.clientY - rect.top
    const gutterHeight = gutter.clientHeight
    const { scrollHeight, clientHeight } = el

    const targetRatio = clickY / gutterHeight
    el.scrollTop = targetRatio * (scrollHeight - clientHeight)
  }, [scrollRef])

  return (
    <div
      ref={gutterRef}
      className="relative w-4 shrink-0 cursor-pointer border-x border-neutral-600 bg-neutral-700"
      onClick={handleGutterClick}
    >
      {/* Diff markers */}
      {markers?.map((m, i) => (
        <div
          key={i}
          className="absolute left-0 right-0 bg-red-500/70"
          style={{
            top: `${m.start * 100}%`,
            height: `max(${m.height * 100}%, 2px)`,
          }}
        />
      ))}

      {/* Scroll thumb */}
      {visible && (
        <div
          className="absolute left-0.5 right-0.5 z-10 rounded-full bg-neutral-400/60 transition-colors hover:bg-neutral-400/80"
          style={{
            top: `${thumbTop}px`,
            height: `${thumbHeight}px`,
            cursor: 'grab',
          }}
          onMouseDown={handleMouseDown}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  )
}
