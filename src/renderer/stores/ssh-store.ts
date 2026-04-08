import { create } from 'zustand'
import type { SSHConfig } from '../../../shared/types'

interface SSHStore {
  readonly configs: readonly SSHConfig[]
  readonly loading: boolean

  loadConfigs: () => Promise<void>
}

export const useSSHStore = create<SSHStore>((set) => ({
  configs: [],
  loading: false,

  loadConfigs: async () => {
    set({ loading: true })
    const result = await window.api.listSSHConfigs()
    if (result.success && result.data) {
      set({ configs: result.data })
    }
    set({ loading: false })
  },
}))
