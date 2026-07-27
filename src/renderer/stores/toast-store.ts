import { create } from 'zustand'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export interface ToastEntry {
  readonly id: string
  readonly tone: ToastTone
  readonly message: string
  readonly description?: string
  readonly action?: { readonly label: string; readonly onClick: () => void }
  readonly createdAt: number
}

type ToastInput = {
  id?: string
  tone?: ToastTone
  message: string
  description?: string
  action?: { label: string; onClick: () => void }
  duration?: number
}

interface ToastStore {
  readonly toasts: readonly ToastEntry[]
  push: (input: ToastInput) => string
  update: (id: string, input: Partial<Omit<ToastEntry, 'id' | 'createdAt'>>) => void
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

  push: ({ id = createToastId(), tone = 'info', message, description, action, duration = DEFAULT_DURATION_MS }) => {
    const entry: ToastEntry = {
      id,
      tone,
      message,
      description,
      action,
      createdAt: Date.now(),
    }
    set((state) => ({
      toasts: [...state.toasts.filter((toast) => toast.id !== id), entry],
    }))

    if (duration > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => {
        if (get().toasts.some((t) => t.id === id)) {
          get().dismiss(id)
        }
      }, duration)
    }

    return id
  },

  update: (id, input) => {
    set((state) => ({
      toasts: state.toasts.map((toast) => toast.id === id ? { ...toast, ...input } : toast),
    }))
  },

  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },

  clear: () => set({ toasts: [] }),
}))

export function showToast(input: Parameters<ToastStore['push']>[0]): string {
  return useToastStore.getState().push(input)
}
