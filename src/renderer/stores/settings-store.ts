import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { mergePathFilters } from '@shared/path-filter'

interface SettingsStore {
  readonly globalPathFilters: readonly string[]
  setGlobalPathFilters: (filters: readonly string[]) => void
}

interface PersistedSettingsState {
  readonly globalPathFilters: readonly string[]
}

const noopStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

const settingsStorage = createJSONStorage<PersistedSettingsState>(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }

  return noopStorage
})

export function createPersistedSettingsState(
  state: Pick<SettingsStore, 'globalPathFilters'>,
): PersistedSettingsState {
  return {
    globalPathFilters: mergePathFilters(state.globalPathFilters),
  }
}

export const useSettingsStore = create<SettingsStore>()(persist((set) => ({
  globalPathFilters: [],

  setGlobalPathFilters: (filters) => set({
    globalPathFilters: mergePathFilters(filters),
  }),
}), {
  name: 'simple-diff-settings-store',
  storage: settingsStorage,
  partialize: createPersistedSettingsState,
}))