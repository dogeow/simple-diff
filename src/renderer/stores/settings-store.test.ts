import { beforeEach, describe, expect, it } from 'vitest'
import { createPersistedSettingsState, useSettingsStore } from './settings-store'

function resetSettingsStore(): void {
  useSettingsStore.setState({ globalPathFilters: [] })
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
    })).toEqual({
      globalPathFilters: ['dist', 'path:docs'],
    })
  })
})