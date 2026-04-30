import { create } from 'zustand'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export interface ToastEntry {
  readonly id: string
  readonly tone: ToastTone
  readonly message: string
  readonly description?: string
  readonly createdAt: number
}

interface ToastStore {
  readonly toasts: readonly ToastEntry[]
  push: (input: { tone?: ToastTone; message: string; description?: string; duration?: number }) => string
  dismiss: (id: string) => void
  clear: () => void
}

const DEFAULT_DURATION_MS = 3500

function createToastId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `toast-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  push: ({ tone = 'info', message, description, duration = DEFAULT_DURATION_MS }) => {
    const id = createToastId()
    const entry: ToastEntry = {
      id,
      tone,
      message,
      description,
      createdAt: Date.now(),
    }
    set((state) => ({ toasts: [...state.toasts, entry] }))

    if (duration > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => {
        if (get().toasts.some((t) => t.id === id)) {
          get().dismiss(id)
        }
      }, duration)
    }

    return id
  },

  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },

  clear: () => set({ toasts: [] }),
}))

export function showToast(input: Parameters<ToastStore['push']>[0]): string {
  return useToastStore.getState().push(input)
}
