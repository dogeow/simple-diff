import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { mergePathFilters } from '@shared/path-filter'
import type { StrategyName } from '../../../shared/types'
import type { HideDotFilter, ViewMode } from './compare/types'

export type ThemePreference = 'system' | 'light' | 'dark'

/**
 * 蓝图 §4.6「对比」区块：一个全新工作区的初始值。
 *
 * 这些是 set-and-forget 偏好，所以住在设置里而不是工具栏上；实际灌入 compare store
 * 的时机见 `utils/compare-defaults.ts`。
 */
export interface CompareDefaults {
  readonly strategies: readonly StrategyName[]
  readonly viewMode: ViewMode
  readonly hideDot: boolean
  readonly hideDotFilter: HideDotFilter
}

export const DEFAULT_COMPARE_DEFAULTS: CompareDefaults = {
  strategies: ['size', 'mtime'],
  viewMode: 'split',
  hideDot: false,
  hideDotFilter: 'all',
}

interface SettingsStore {
  readonly globalPathFilters: readonly string[]
  readonly theme: ThemePreference
  readonly compareDefaults: CompareDefaults
  /**
   * DESIGN-SYSTEM §1.5：绿/红在深色下的色盲分离度只有 ΔE 5.6，低于 ΔE 6 底线。
   * 打开后 `<html data-colorblind-diff>` 把 add/del 换成蓝/橙（ΔE 24.4），组件零改动。
   */
  readonly colorblindDiff: boolean
  setGlobalPathFilters: (filters: readonly string[]) => void
  setTheme: (theme: ThemePreference) => void
  setCompareDefaults: (patch: Partial<CompareDefaults>) => void
  setColorblindDiff: (enabled: boolean) => void
}

interface PersistedSettingsState {
  readonly globalPathFilters: readonly string[]
  readonly theme: ThemePreference
  readonly compareDefaults: CompareDefaults
  readonly colorblindDiff: boolean
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
  state: Pick<SettingsStore, 'globalPathFilters' | 'theme' | 'compareDefaults' | 'colorblindDiff'>,
): PersistedSettingsState {
  return {
    globalPathFilters: mergePathFilters(state.globalPathFilters),
    theme: state.theme,
    compareDefaults: state.compareDefaults,
    colorblindDiff: state.colorblindDiff,
  }
}

export const useSettingsStore = create<SettingsStore>()(persist((set) => ({
  globalPathFilters: [],
  theme: 'system',
  compareDefaults: DEFAULT_COMPARE_DEFAULTS,
  colorblindDiff: false,

  setGlobalPathFilters: (filters) => set({
    globalPathFilters: mergePathFilters(filters),
  }),
  setTheme: (theme) => set({ theme }),
  setCompareDefaults: (patch) => set((state) => ({
    compareDefaults: { ...state.compareDefaults, ...patch },
  })),
  setColorblindDiff: (colorblindDiff) => set({ colorblindDiff }),
}), {
  name: 'simple-diff-settings-store',
  version: 2,
  storage: settingsStorage,
  // v1 只存了 globalPathFilters + theme；补齐新键，老用户不会拿到 undefined。
  migrate: (persisted) => {
    const previous = (persisted ?? {}) as Partial<PersistedSettingsState>
    return {
      globalPathFilters: previous.globalPathFilters ?? [],
      theme: previous.theme ?? 'system',
      compareDefaults: { ...DEFAULT_COMPARE_DEFAULTS, ...previous.compareDefaults },
      colorblindDiff: previous.colorblindDiff ?? false,
    }
  },
  partialize: (state: SettingsStore) => createPersistedSettingsState(state),
}))
