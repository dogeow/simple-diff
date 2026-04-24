import { create } from 'zustand'
import type { LogEntry, LogLevel, LogScope } from '../../../shared/types'

const MAX_LOGS = 500

interface LogStore {
  readonly logs: readonly LogEntry[]
  readonly visible: boolean
  addLog: (entry: LogEntry) => void
  toggleVisible: () => void
  setVisible: (visible: boolean) => void
  clear: () => void
}

export const useLogStore = create<LogStore>((set, get) => ({
  logs: [],
  visible: false,

  addLog: (entry) => {
    const logs = [...get().logs, entry]
    set({ logs: logs.length > MAX_LOGS ? logs.slice(-MAX_LOGS) : logs })
  },

  toggleVisible: () => set({ visible: !get().visible }),

  setVisible: (visible) => set({ visible }),

  clear: () => set({ logs: [] }),
}))

export function addRendererLog(scope: LogScope, level: LogLevel, message: string): void {
  useLogStore.getState().addLog({
    timestamp: Date.now(),
    scope,
    level,
    message: `[renderer] ${message}`,
  })
}
