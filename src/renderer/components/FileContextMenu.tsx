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

  return (
    <div
      ref={ref}
      className="fixed z-[100] min-w-[160px] rounded border border-neutral-600 bg-neutral-800 py-1 shadow-xl"
      style={{ left: pos.x, top: pos.y }}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => {
            action.onClick()
            onClose()
          }}
          className={`w-full whitespace-nowrap px-3 py-1.5 text-left text-xs hover:bg-neutral-700 ${
            action.danger ? 'text-red-400' : 'text-neutral-200'
          }`}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}
