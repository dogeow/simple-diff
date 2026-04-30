import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly ariaLabel?: string
  readonly maxWidth?: string
  readonly children: ReactNode
}

export default function Modal({ open, onClose, ariaLabel, maxWidth = 'max-w-2xl', children }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/60 px-4 pt-[15vh] pb-8 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`relative w-full ${maxWidth} overflow-hidden rounded-xl border border-neutral-700 bg-neutral-850 shadow-2xl ring-1 ring-black/30`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
