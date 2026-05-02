import { beforeEach, describe, expect, it } from 'vitest'
import { createPersistedAppState, useAppStore, type DiffTab } from './app-store'
import type { CompareSessionSnapshot } from './compare-store'

function createDiffTab(overrides: Partial<DiffTab> = {}): DiffTab {
  return {
    id: 'src/file.txt',
    sessionId: 'session-1',
    relativePath: 'src/file.txt',
    fileName: 'file.txt',
    hasLeftFile: true,
    hasRightFile: true,
    leftSource: { type: 'local', path: '/left' },
    rightSource: { type: 'local', path: '/right' },
    leftFullPath: '/left/src/file.txt',
    rightFullPath: '/right/src/file.txt',
    leftContent: '',
    rightContent: '',
    originalLeftContent: '',
    originalRightContent: '',
    diffResult: null,
    loadError: null,
    loading: false,
    ...overrides,
  }
}

function resetAppStore(): void {
  useAppStore.setState({
    page: 'home',
    diffTabs: [],
    activeDiffTabId: null,
    compareTabs: [],
    activeCompareTabId: null,
  })
}

function createCompareSnapshot(overrides: Partial<CompareSessionSnapshot> = {}): CompareSessionSnapshot {
  return {
    leftPath: '/left',
    rightPath: '/right',
    leftSourceType: 'local',
    rightSourceType: 'local',
    leftSSHConfigId: '',
    rightSSHConfigId: '',
    strategies: ['size', 'mtime'],
    extensionFilter: ['node_modules'],
    hideDot: true,
    hideDotFilter: 'all',
    entries: [],
    scanning: false,
    comparing: false,
    paused: false,
    done: true,
    error: null,
    duration: 123,
    leftSource: { type: 'local', path: '/left' },
    rightSource: { type: 'local', path: '/right' },
    loadingDirs: [],
    filter: 'all',
    expandedDirs: [],
    viewMode: 'split',
    activeCompareId: 'compare-1',
    ...overrides,
  }
}

describe('app-store', () => {
  beforeEach(() => {
    resetAppStore()
  })

  it('tracks tab sessions so stale async work can be ignored after reopen', () => {
    const store = useAppStore.getState()

    store.addDiffTab(createDiffTab({ id: 'shared/file.txt', sessionId: 'session-old' }))
    expect(store.hasDiffTabSession('shared/file.txt', 'session-old')).toBe(true)

    store.closeDiffTab('shared/file.txt')
    expect(useAppStore.getState().hasDiffTabSession('shared/file.txt', 'session-old')).toBe(false)

    store.addDiffTab(createDiffTab({ id: 'shared/file.txt', sessionId: 'session-new' }))

    const currentState = useAppStore.getState()
    expect(currentState.hasDiffTabSession('shared/file.txt', 'session-old')).toBe(false)
    expect(currentState.hasDiffTabSession('shared/file.txt', 'session-new')).toBe(true)
  })

  it('keeps a single tab instance when reopening an already-open file', () => {
    const store = useAppStore.getState()

    store.addDiffTab(createDiffTab({ id: 'shared/file.txt', sessionId: 'session-1' }))
    store.addDiffTab(createDiffTab({ id: 'shared/file.txt', sessionId: 'session-2' }))

    const currentState = useAppStore.getState()
    expect(currentState.diffTabs).toHaveLength(1)
    expect(currentState.diffTabs[0]?.sessionId).toBe('session-1')
    expect(currentState.activeDiffTabId).toBe('shared/file.txt')
  })

  it('stores compare tabs with their own file diff tabs', () => {
    const store = useAppStore.getState()

    store.saveCompareTab({
      id: 'compare-tab-1',
      title: 'left ↔ right',
      snapshot: createCompareSnapshot(),
      diffTabs: [createDiffTab({ id: 'a.txt' })],
      activeDiffTabId: 'a.txt',
    })
    store.setActiveCompareTab('compare-tab-1')
    store.replaceDiffTabs([createDiffTab({ id: 'live.txt' })], 'live.txt')

    const currentState = useAppStore.getState()
    expect(currentState.compareTabs).toHaveLength(1)
    expect(currentState.compareTabs[0]?.diffTabs.map((tab) => tab.id)).toEqual(['a.txt'])
    expect(currentState.activeCompareTabId).toBe('compare-tab-1')
    expect(currentState.diffTabs.map((tab) => tab.id)).toEqual(['live.txt'])
  })

  it('drops loading file diff tabs when saving compare tabs for same-process restore', () => {
    const store = useAppStore.getState()

    store.saveCompareTab({
      id: 'compare-tab-1',
      title: 'left ↔ right',
      snapshot: createCompareSnapshot(),
      diffTabs: [
        createDiffTab({ id: 'kept.txt', loading: false, diffResult: { leftLines: [], rightLines: [] } }),
        createDiffTab({ id: 'loading.txt', loading: true }),
      ],
      activeDiffTabId: 'loading.txt',
    })

    const currentState = useAppStore.getState()
    expect(currentState.compareTabs[0]?.diffTabs.map((tab) => tab.id)).toEqual(['kept.txt'])
    expect(currentState.compareTabs[0]?.activeDiffTabId).toBe('kept.txt')
  })

  it('selects the last remaining compare tab when closing the active one', () => {
    const store = useAppStore.getState()

    store.saveCompareTab({
      id: 'compare-tab-1',
      title: 'first',
      snapshot: createCompareSnapshot({ activeCompareId: 'compare-1' }),
      diffTabs: [],
      activeDiffTabId: null,
    })
    store.saveCompareTab({
      id: 'compare-tab-2',
      title: 'second',
      snapshot: createCompareSnapshot({ activeCompareId: 'compare-2' }),
      diffTabs: [],
      activeDiffTabId: null,
    })
    store.setActiveCompareTab('compare-tab-2')
    store.closeCompareTab('compare-tab-2')

    const currentState = useAppStore.getState()
    expect(currentState.compareTabs.map((tab) => tab.id)).toEqual(['compare-tab-1'])
    expect(currentState.activeCompareTabId).toBe('compare-tab-1')
  })

  it('updates compare tab snapshots by compare id', () => {
    const store = useAppStore.getState()

    store.saveCompareTab({
      id: 'compare-tab-1',
      title: 'first',
      snapshot: createCompareSnapshot({ activeCompareId: 'compare-1', scanning: true }),
      diffTabs: [],
      activeDiffTabId: null,
    })
    store.saveCompareTab({
      id: 'compare-tab-2',
      title: 'second',
      snapshot: createCompareSnapshot({ activeCompareId: 'compare-2', scanning: true }),
      diffTabs: [],
      activeDiffTabId: null,
    })

    store.updateCompareTabSnapshotByCompareId('compare-2', (snapshot) => ({
      ...snapshot,
      scanning: false,
      done: true,
    }))

    const currentState = useAppStore.getState()
    expect(currentState.compareTabs.find((tab) => tab.id === 'compare-tab-1')?.snapshot.scanning).toBe(true)
    expect(currentState.compareTabs.find((tab) => tab.id === 'compare-tab-2')?.snapshot.scanning).toBe(false)
    expect(currentState.compareTabs.find((tab) => tab.id === 'compare-tab-2')?.snapshot.done).toBe(true)
  })

  it('persists file diff subtabs for the active compare tab and drops loading tabs', () => {
    const persisted = createPersistedAppState({
      page: 'compare',
      activeCompareTabId: 'compare-tab-1',
      compareTabs: [{
        id: 'compare-tab-1',
        title: 'left ↔ right',
        snapshot: createCompareSnapshot({
          activeCompareId: 'compare-1',
          scanning: true,
          done: false,
          entries: [{
            relativePath: 'bootstrap',
            name: 'bootstrap',
            isDirectory: true,
            state: 'pending',
            left: { name: 'bootstrap', path: 'bootstrap', isDirectory: true, size: 0, mtime: 1 },
            right: { name: 'bootstrap', path: 'bootstrap', isDirectory: true, size: 0, mtime: 1 },
            reasons: [],
          }],
        }),
        diffTabs: [createDiffTab({ id: 'stale.txt' })],
        activeDiffTabId: 'stale.txt',
      }],
      diffTabs: [
        createDiffTab({ id: 'kept.txt', loading: false, diffResult: { leftLines: [], rightLines: [] } }),
        createDiffTab({ id: 'loading.txt', loading: true }),
      ],
      activeDiffTabId: 'loading.txt',
    })

    expect(persisted.compareTabs[0]?.snapshot.scanning).toBe(false)
    expect(persisted.compareTabs[0]?.snapshot.activeCompareId).toBeNull()
    expect(persisted.compareTabs[0]?.snapshot.entries).toEqual([])
    expect(persisted.compareTabs[0]?.snapshot.duration).toBe(0)
    expect(persisted.compareTabs[0]?.diffTabs.map((tab) => tab.id)).toEqual(['kept.txt'])
    expect(persisted.compareTabs[0]?.activeDiffTabId).toBe('kept.txt')
  })
})
