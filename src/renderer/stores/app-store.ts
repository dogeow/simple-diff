import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { SourceConfig, TextDiffResult } from '../../../shared/types'
import { sanitizePersistedCompareSessionSnapshot, type CompareSessionSnapshot } from './compare-store'

export type Page = 'home' | 'compare' | 'text' | 'ssh' | 'history' | 'sync' | 'settings'

export interface DiffTab {
  readonly id: string
  readonly sessionId: string
  readonly relativePath: string
  readonly fileName: string
  readonly hasLeftFile: boolean
  readonly hasRightFile: boolean
  readonly leftSource: SourceConfig | null
  readonly rightSource: SourceConfig | null
  readonly leftFullPath: string
  readonly rightFullPath: string
  readonly leftContent: string
  readonly rightContent: string
  readonly originalLeftContent: string
  readonly originalRightContent: string
  readonly diffResult: TextDiffResult | null
  readonly loadError: string | null
  readonly loading: boolean
}

export interface CompareTab {
  readonly id: string
  readonly title: string
  readonly snapshot: CompareSessionSnapshot
  readonly diffTabs: readonly DiffTab[]
  readonly activeDiffTabId: string | null
}

interface AppStore {
  readonly page: Page
  readonly diffTabs: readonly DiffTab[]
  readonly activeDiffTabId: string | null
  readonly compareTabs: readonly CompareTab[]
  readonly activeCompareTabId: string | null

  setPage: (page: Page) => void
  addDiffTab: (tab: DiffTab) => void
  updateDiffTab: (id: string, updates: Partial<DiffTab>) => void
  closeDiffTab: (id: string) => void
  setActiveDiffTab: (id: string | null) => void
  replaceDiffTabs: (tabs: readonly DiffTab[], activeId: string | null) => void
  clearDiffTabs: () => void
  saveCompareTab: (tab: CompareTab) => void
  updateCompareTabSnapshot: (id: string, updater: (snapshot: CompareSessionSnapshot) => CompareSessionSnapshot) => void
  updateCompareTabSnapshotByCompareId: (compareId: string, updater: (snapshot: CompareSessionSnapshot) => CompareSessionSnapshot) => void
  closeCompareTab: (id: string) => void
  setActiveCompareTab: (id: string | null) => void
  hasDiffTabSession: (id: string, sessionId: string) => boolean
}

interface PersistedAppState {
  readonly compareTabs: readonly CompareTab[]
  readonly activeCompareTabId: string | null
}

function sanitizePersistedDiffTabs(diffTabs: readonly DiffTab[]): readonly DiffTab[] {
  return diffTabs
    .filter((tab) => !tab.loading)
    .map((tab) => ({
      ...tab,
      leftContent: '',
      rightContent: '',
      originalLeftContent: '',
      originalRightContent: '',
      diffResult: null,
    }))
}

function createRestorableCompareTab(
  tab: CompareTab,
  liveDiffTabs?: readonly DiffTab[],
  liveActiveDiffTabId?: string | null,
): CompareTab {
  const diffTabs = sanitizePersistedDiffTabs(liveDiffTabs ?? tab.diffTabs)
  const requestedActiveDiffTabId = liveActiveDiffTabId ?? tab.activeDiffTabId
  const activeDiffTabId = diffTabs.some((diffTab) => diffTab.id === requestedActiveDiffTabId)
    ? requestedActiveDiffTabId
    : (diffTabs.at(-1)?.id ?? null)

  return {
    ...tab,
    diffTabs,
    activeDiffTabId,
  }
}

export function createPersistedAppState(state: Pick<AppStore, 'page' | 'compareTabs' | 'activeCompareTabId' | 'diffTabs' | 'activeDiffTabId'>): PersistedAppState {
  const shouldMergeLiveDiffTabs = state.page === 'compare' || state.diffTabs.length > 0 || state.activeDiffTabId !== null
  const persistedCompareTabs = state.compareTabs.map((tab) => {
    const isActiveCompareTab = shouldMergeLiveDiffTabs && tab.id === state.activeCompareTabId
    const restorableTab = createRestorableCompareTab(
      tab,
      isActiveCompareTab ? state.diffTabs : undefined,
      isActiveCompareTab ? state.activeDiffTabId : undefined,
    )

    return {
      ...restorableTab,
      snapshot: sanitizePersistedCompareSessionSnapshot(tab.snapshot),
    }
  })

  return {
    compareTabs: persistedCompareTabs,
    activeCompareTabId: state.activeCompareTabId,
  }
}

const noopStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

const appStorage = createJSONStorage<PersistedAppState>(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }

  return noopStorage
})

export const useAppStore = create<AppStore>()(persist((set, get) => ({
  page: 'home',
  diffTabs: [],
  activeDiffTabId: null,
  compareTabs: [],
  activeCompareTabId: null,

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

  replaceDiffTabs: (tabs, activeDiffTabId) => set({
    diffTabs: [...tabs],
    activeDiffTabId,
  }),

  clearDiffTabs: () => set({ diffTabs: [], activeDiffTabId: null }),

  saveCompareTab: (tab) => {
    set((state) => {
      const nextTab = createRestorableCompareTab(tab)
      const existingIndex = state.compareTabs.findIndex((candidate) => candidate.id === tab.id)

      if (existingIndex < 0) {
        return { compareTabs: [...state.compareTabs, nextTab] }
      }

      const compareTabs = [...state.compareTabs]
      compareTabs[existingIndex] = nextTab
      return { compareTabs }
    })
  },

  updateCompareTabSnapshot: (id, updater) => {
    set((state) => {
      const compareTabs = state.compareTabs.map((tab) => {
        if (tab.id !== id) return tab
        return {
          ...tab,
          snapshot: updater(tab.snapshot),
        }
      })

      return { compareTabs }
    })
  },

  updateCompareTabSnapshotByCompareId: (compareId, updater) => {
    set((state) => {
      const compareTabs = state.compareTabs.map((tab) => {
        if (tab.snapshot.activeCompareId !== compareId) return tab
        return {
          ...tab,
          snapshot: updater(tab.snapshot),
        }
      })

      return { compareTabs }
    })
  },

  closeCompareTab: (id) => {
    set((state) => {
      const compareTabs = state.compareTabs.filter((tab) => tab.id !== id)
      const activeCompareTabId = state.activeCompareTabId === id
        ? (compareTabs.at(-1)?.id ?? null)
        : state.activeCompareTabId

      return {
        compareTabs,
        activeCompareTabId,
      }
    })
  },

  setActiveCompareTab: (id) => set({ activeCompareTabId: id }),

  hasDiffTabSession: (id, sessionId) => {
    return get().diffTabs.some((tab) => tab.id === id && tab.sessionId === sessionId)
  },
}), {
  name: 'simple-diff-app-store',
  storage: appStorage,
  partialize: createPersistedAppState,
}))
