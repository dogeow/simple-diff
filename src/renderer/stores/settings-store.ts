import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { mergePathFilters } from '@shared/path-filter'

export type ThemePreference = 'system' | 'light' | 'dark'

interface SettingsStore {
  readonly globalPathFilters: readonly string[]
  readonly theme: ThemePreference
  setGlobalPathFilters: (filters: readonly string[]) => void
  setTheme: (theme: ThemePreference) => void
}

interface PersistedSettingsState {
  readonly globalPathFilters: readonly string[]
  readonly theme: ThemePreference
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
  state: Pick<SettingsStore, 'globalPathFilters' | 'theme'>,
): PersistedSettingsState {
  return {
    globalPathFilters: mergePathFilters(state.globalPathFilters),
    theme: state.theme,
  }
}

export const useSettingsStore = create<SettingsStore>()(persist((set) => ({
  globalPathFilters: [],
  theme: 'system',

  setGlobalPathFilters: (filters) => set({
    globalPathFilters: mergePathFilters(filters),
  }),
  setTheme: (theme) => set({ theme }),
}), {
  name: 'simple-diff-settings-store',
  storage: settingsStorage,
  partialize: createPersistedSettingsState,
}))
