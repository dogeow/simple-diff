import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_COMPARE_DEFAULTS,
  createPersistedSettingsState,
  useSettingsStore,
} from './settings-store'

function resetSettingsStore(): void {
  useSettingsStore.setState({
    globalPathFilters: [],
    theme: 'system',
    compareDefaults: DEFAULT_COMPARE_DEFAULTS,
    colorblindDiff: false,
  })
}

describe('settings-store', () => {
  beforeEach(() => {
    resetSettingsStore()
  })

  it('normalizes and dedupes global path filters when saving', () => {
    useSettingsStore.getState().setGlobalPathFilters([' node_modules ', 'NODE_MODULES', 'path:/Config', 'path:/Config'])

    expect(useSettingsStore.getState().globalPathFilters).toEqual(['node_modules', 'path:Config'])
  })

  it('creates persisted settings state with sanitized filters', () => {
    expect(createPersistedSettingsState({
      globalPathFilters: [' dist ', 'DIST', 'path:/docs'],
      theme: 'dark',
      compareDefaults: DEFAULT_COMPARE_DEFAULTS,
      colorblindDiff: true,
    })).toEqual({
      globalPathFilters: ['dist', 'path:docs'],
      theme: 'dark',
      compareDefaults: DEFAULT_COMPARE_DEFAULTS,
      colorblindDiff: true,
    })
  })

  it('updates the preferred theme', () => {
    useSettingsStore.getState().setTheme('light')

    expect(useSettingsStore.getState().theme).toBe('light')
  })

  it('patches compare defaults without dropping the other keys', () => {
    useSettingsStore.getState().setCompareDefaults({ viewMode: 'merged' })

    expect(useSettingsStore.getState().compareDefaults).toEqual({
      ...DEFAULT_COMPARE_DEFAULTS,
      viewMode: 'merged',
    })
  })

  it('tracks the colorblind diff preference', () => {
    useSettingsStore.getState().setColorblindDiff(true)

    expect(useSettingsStore.getState().colorblindDiff).toBe(true)
  })
})
