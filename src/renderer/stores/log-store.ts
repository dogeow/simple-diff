import { create } from 'zustand'
import type { LogEntry } from '../../../shared/types'

const MAX_LOGS = 500

interface LogStore {
  readonly logs: readonly LogEntry[]
  readonly visible: boolean
  addLog: (entry: LogEntry) => void
  toggleVisible: () => void
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

  clear: () => set({ logs: [] }),
}))
