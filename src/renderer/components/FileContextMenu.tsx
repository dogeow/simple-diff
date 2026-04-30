import { useState, useEffect, useRef } from 'react'

export interface ContextMenuAction {
  readonly label: string
  readonly danger?: boolean
  readonly onClick: () => void
}

interface FileContextMenuProps {
  readonly x: number
  readonly y: number
  readonly actions: readonly ContextMenuAction[]
  readonly onClose: () => void
}

export default function FileContextMenu({ x, y, actions, onClose }: FileContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Adjust position to keep menu in viewport
  const [pos, setPos] = useState({ x, y })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const newX = x + rect.width > window.innerWidth ? x - rect.width : x
    const newY = y + rect.height > window.innerHeight ? y - rect.height : y
    setPos({ x: Math.max(0, newX), y: Math.max(0, newY) })
  }, [x, y])

  // Insert separator before danger actions when there are non-danger actions before
  let lastWasNonDanger = false

  return (
    <div
      ref={ref}
      className="fixed z-[100] min-w-[180px] overflow-hidden rounded-md border border-neutral-700 bg-neutral-850 py-1 shadow-2xl ring-1 ring-black/40"
      style={{ left: pos.x, top: pos.y }}
    >
      {actions.map((action, index) => {
        const showSeparator = action.danger && lastWasNonDanger
        if (!action.danger) {
          lastWasNonDanger = true
        }

        return (
          <div key={`${action.label}-${index}`}>
            {showSeparator && <div className="my-1 h-px bg-neutral-700/70" aria-hidden="true" />}
            <button
              onClick={() => {
                action.onClick()
                onClose()
              }}
              className={`block w-full whitespace-nowrap px-3 py-1.5 text-left text-xs transition-colors ${
                action.danger
                  ? 'text-rose-300 hover:bg-rose-500/15 hover:text-rose-200'
                  : 'text-neutral-200 hover:bg-neutral-700/70'
              }`}
            >
              {action.label}
            </button>
          </div>
        )
      })}
    </div>
  )
}
