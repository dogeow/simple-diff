import { useToastStore, type ToastTone } from '../stores/toast-store'
import { CircleCheck, CircleX, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react'

const TONE_STYLES: Record<ToastTone, { bg: string; ring: string; icon: string; text: string }> = {
  info: {
    bg: 'bg-raised',
    ring: 'ring-border-strong',
    icon: 'text-accent-text',
    text: 'text-fg',
  },
  success: {
    bg: 'bg-raised',
    ring: 'ring-success/30',
    icon: 'text-success-text',
    text: 'text-success-text',
  },
  warning: {
    bg: 'bg-raised',
    ring: 'ring-warning/30',
    icon: 'text-warning-text',
    text: 'text-warning-text',
  },
  error: {
    bg: 'bg-raised',
    ring: 'ring-danger/30',
    icon: 'text-danger-text',
    text: 'text-danger-text',
  },
}

/** DESIGN-SYSTEM §6 — reserved status glyphs; colour never carries the meaning alone. */
const TONE_GLYPH: Record<ToastTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleX,
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed top-14 right-4 z-toast flex w-80 flex-col gap-2"
    >
      {toasts.map((toast) => {
        const style = TONE_STYLES[toast.tone]
        const Glyph = TONE_GLYPH[toast.tone]
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg ${style.bg} px-3 py-2.5 shadow-overlay ring-1 ${style.ring}`}
          >
            <Glyph aria-hidden size={14} strokeWidth={1.75} className={`mt-0.5 shrink-0 ${style.icon}`} />
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-medium ${style.text}`}>{toast.message}</div>
              {toast.description && (
                <div className="mt-0.5 text-xs text-fg-muted">{toast.description}</div>
              )}
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              aria-label="关闭通知"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <X aria-hidden size={12} strokeWidth={1.75} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
