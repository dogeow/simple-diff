import { create } from 'zustand'
import type { SourceConfig, TextDiffResult } from '../../../shared/types'

export type Page = 'home' | 'compare' | 'text' | 'ssh' | 'history'

export interface DiffTab {
  readonly id: string
  readonly relativePath: string
  readonly fileName: string
  readonly leftSource: SourceConfig | null
  readonly rightSource: SourceConfig | null
  readonly leftFullPath: string
  readonly rightFullPath: string
  readonly leftContent: string
  readonly rightContent: string
  readonly originalLeftContent: string
  readonly originalRightContent: string
  readonly diffResult: TextDiffResult | null
  readonly loading: boolean
}

interface AppStore {
  readonly page: Page
  readonly diffTabs: readonly DiffTab[]
  readonly activeDiffTabId: string | null

  setPage: (page: Page) => void
  addDiffTab: (tab: DiffTab) => void
  updateDiffTab: (id: string, updates: Partial<DiffTab>) => void
  closeDiffTab: (id: string) => void
  setActiveDiffTab: (id: string | null) => void
  clearDiffTabs: () => void
}

export const useAppStore = create<AppStore>((set, get) => ({
  page: 'home',
  diffTabs: [],
  activeDiffTabId: null,

  setPage: (page) => set({ page }),

  addDiffTab: (tab) => {
    const existing = get().diffTabs.find((t) => t.id === tab.id)
    if (existing) {
      set({ activeDiffTabId: tab.id })
      return
    }
    set((state) => ({
      diffTabs: [...state.diffTabs, tab],
      activeDiffTabId: tab.id,
    }))
  },

  updateDiffTab: (id, updates) => {
    set((state) => ({
      diffTabs: state.diffTabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }))
  },

  closeDiffTab: (id) => {
    set((state) => {
      const newTabs = state.diffTabs.filter((t) => t.id !== id)
      const newActive =
        state.activeDiffTabId === id
          ? newTabs.length > 0
            ? newTabs[newTabs.length - 1].id
            : null
          : state.activeDiffTabId
      return { diffTabs: newTabs, activeDiffTabId: newActive }
    })
  },

  setActiveDiffTab: (id) => set({ activeDiffTabId: id }),

  clearDiffTabs: () => set({ diffTabs: [], activeDiffTabId: null }),
}))
