import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'

export interface SplitPaneProps {
  /** `horizontal` = side-by-side. */
  direction?: 'horizontal' | 'vertical'
  storageKey?: string
  defaultRatio?: number
  /** px bounds on the first pane. */
  min?: number
  max?: number
  className?: string
  label?: string
  children: [React.ReactNode, React.ReactNode]
}

function readRatio(storageKey: string | undefined, fallback: number): number {
  if (!storageKey || typeof localStorage === 'undefined') return fallback
  const raw = localStorage.getItem(`ds-split:${storageKey}`)
  const parsed = raw === null ? Number.NaN : Number(raw)
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : fallback
}

/** Drag AND keyboard resize; double-click resets. Zero transition while dragging. */
export function SplitPane({
  direction = 'horizontal',
  storageKey,
  defaultRatio = 0.5,
  min = 120,
  max,
  className,
  label = '调整分栏',
  children,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(() => readRatio(storageKey, defaultRatio))
  const [dragging, setDragging] = useState(false)
  const horizontal = direction === 'horizontal'
  // 拖拽期间不写 localStorage（每个 mousemove 一次同步写盘会掉帧），松手时写一次。
  // 所以最新的比例要有一份 ref 副本供 mouseup 读。
  const ratioRef = useRef(ratio)

  /**
   * `min` / `max` 是第一栏的**像素**下限，但比例才是渲染用的量，所以两者都要参与夹取：
   * 只夹 10%–90% 的话，窗口一宽，键盘调整就能把一栏压到 min 以下；只夹像素的话，
   * 容器还没量出尺寸时（首帧 / jsdom）又无从下手。两条都算，取交集。
   */
  const clampRatio = useCallback(
    (next: number) => {
      const node = containerRef.current
      const total = node ? (horizontal ? node.clientWidth : node.clientHeight) : 0
      let lower = 0.1
      let upper = 0.9

      if (total > 0) {
        lower = Math.max(lower, min / total)
        upper = Math.min(upper, (max ?? total - min) / total)
        if (lower > upper) {
          // 容器窄到两栏的最小值都放不下：退回正中，谁也不独占。
          lower = 0.5
          upper = 0.5
        }
      }

      return Math.min(upper, Math.max(lower, next))
    },
    [horizontal, min, max],
  )

  const apply = useCallback(
    (next: number) => {
      const clamped = clampRatio(next)
      ratioRef.current = clamped
      setRatio(clamped)
    },
    [clampRatio],
  )

  const persist = useCallback(() => {
    if (storageKey && typeof localStorage !== 'undefined') {
      localStorage.setItem(`ds-split:${storageKey}`, String(ratioRef.current))
    }
  }, [storageKey])

  const commit = useCallback(
    (next: number) => {
      apply(next)
      persist()
    },
    [apply, persist],
  )

  const fromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const node = containerRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      const total = horizontal ? rect.width : rect.height
      if (total <= 0) return
      const px = horizontal ? clientX - rect.left : clientY - rect.top
      apply(px / total)
    },
    [horizontal, apply],
  )

  useEffect(() => {
    if (!dragging) return
    const onMove = (event: MouseEvent) => fromPointer(event.clientX, event.clientY)
    const onUp = () => {
      setDragging(false)
      persist()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [dragging, fromPointer, persist])

  const onKeyDown = (event: React.KeyboardEvent) => {
    const node = containerRef.current
    if (!node) return
    const total = horizontal ? node.clientWidth : node.clientHeight
    const step = (event.shiftKey ? 32 : 8) / (total > 0 ? total : 1000)
    const back = horizontal ? 'ArrowLeft' : 'ArrowUp'
    const forward = horizontal ? 'ArrowRight' : 'ArrowDown'
    if (event.key === back) {
      event.preventDefault()
      commit(ratio - step)
    } else if (event.key === forward) {
      event.preventDefault()
      commit(ratio + step)
    } else if (event.key === 'Home') {
      event.preventDefault()
      commit(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      commit(1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      // 双击复位的键盘等价物——鼠标能一步回到默认比例，键盘也要能。
      event.preventDefault()
      commit(defaultRatio)
    }
  }

  const percent = Math.round(ratio * 100)

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex min-h-0 min-w-0',
        horizontal ? 'flex-row' : 'flex-col',
        // 拖拽时不要顺手把两栏的文本全选中了。
        dragging && 'select-none',
        className,
      )}
    >
      <div className="flex min-h-0 min-w-0" style={{ flex: `0 0 ${ratio * 100}%` }}>
        {children[0]}
      </div>
      <div
        role="separator"
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-label={label}
        aria-valuemin={10}
        aria-valuemax={90}
        aria-valuenow={percent}
        aria-valuetext={`${percent}%`}
        tabIndex={0}
        data-focus-inset
        onMouseDown={() => setDragging(true)}
        onDoubleClick={() => commit(defaultRatio)}
        onKeyDown={onKeyDown}
        className={cn(
          // 命中区 8px、视觉线 1px（PRIMITIVES §14）。1px 的命中区是拖不中的。
          'group z-resizer flex shrink-0 items-center justify-center',
          horizontal ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            horizontal ? 'h-full w-px' : 'h-px w-full',
            dragging ? 'bg-accent' : 'bg-border-strong group-hover:bg-accent',
          )}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1">{children[1]}</div>
    </div>
  )
}
