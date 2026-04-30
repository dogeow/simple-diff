import { useToastStore, type ToastTone } from '../stores/toast-store'
import { CheckIcon, CloseIcon } from './Icons'

const TONE_STYLES: Record<ToastTone, { bg: string; ring: string; icon: string; text: string }> = {
  info: {
    bg: 'bg-neutral-850',
    ring: 'ring-neutral-700',
    icon: 'text-blue-300',
    text: 'text-neutral-100',
  },
  success: {
    bg: 'bg-emerald-950/90',
    ring: 'ring-emerald-500/40',
    icon: 'text-emerald-300',
    text: 'text-emerald-100',
  },
  warning: {
    bg: 'bg-amber-950/90',
    ring: 'ring-amber-500/40',
    icon: 'text-amber-300',
    text: 'text-amber-100',
  },
  error: {
    bg: 'bg-rose-950/90',
    ring: 'ring-rose-500/40',
    icon: 'text-rose-300',
    text: 'text-rose-100',
  },
}

const TONE_GLYPH: Record<ToastTone, string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  error: '×',
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed top-14 right-4 z-[150] flex w-80 flex-col gap-2"
    >
      {toasts.map((toast) => {
        const style = TONE_STYLES[toast.tone]
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg ${style.bg} px-3 py-2.5 shadow-2xl ring-1 ${style.ring}`}
          >
            <span
              className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ring-inset ${style.icon} ${style.ring}`}
              aria-hidden="true"
            >
              {toast.tone === 'success' ? <CheckIcon width={11} height={11} /> : TONE_GLYPH[toast.tone]}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-medium ${style.text}`}>{toast.message}</div>
              {toast.description && (
                <div className="mt-0.5 text-xs text-neutral-400">{toast.description}</div>
              )}
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              aria-label="关闭通知"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-700/50 hover:text-neutral-200"
            >
              <CloseIcon width={11} height={11} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
