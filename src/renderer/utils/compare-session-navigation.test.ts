import { beforeEach, describe, expect, it } from 'vitest'
import { leaveComparePage, openCompareTab } from './compare-session-navigation'
import { useAppStore, type DiffTab } from '../stores/app-store'
import { useCompareStore, type CompareSessionSnapshot } from '../stores/compare-store'
import { useLogStore } from '../stores/log-store'

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

function createDiffTab(overrides: Partial<DiffTab> = {}): DiffTab {
  return {
    id: 'src/file.txt',
    sessionId: 'session-1',
    relativePath: 'src/file.txt',
    fileName: 'file.txt',
    leftSource: { type: 'local', path: '/left' },
    rightSource: { type: 'local', path: '/right' },
    leftFullPath: '/left/src/file.txt',
    rightFullPath: '/right/src/file.txt',
    leftContent: '',
    rightContent: '',
    originalLeftContent: '',
    originalRightContent: '',
    diffResult: null,
    loading: false,
    ...overrides,
  }
}

function resetStores(): void {
  useAppStore.setState({
    page: 'compare',
    diffTabs: [],
    activeDiffTabId: null,
    compareTabs: [],
    activeCompareTabId: null,
  })

  useCompareStore.getState().resetCompare()
  useCompareStore.setState({
    leftPath: '',
    rightPath: '',
    leftSourceType: 'local',
    rightSourceType: 'local',
    leftSSHConfigId: '',
    rightSSHConfigId: '',
    strategies: ['size', 'mtime'],
    extensionFilter: ['node_modules', '.git', 'dist'],
    hideDot: true,
    hideDotFilter: 'all',
  })

  useLogStore.setState({ logs: [], visible: false })
}

describe('leaveComparePage', () => {
  beforeEach(() => {
    resetStores()
  })

  it('persists the active compare tab and returns to the directory compare home page', () => {
    const snapshot = createCompareSnapshot({ entries: [{
      relativePath: 'src/app.ts',
      name: 'app.ts',
      isDirectory: false,
      state: 'different',
      left: { name: 'app.ts', path: 'src/app.ts', isDirectory: false, size: 1, mtime: 1 },
      right: { name: 'app.ts', path: 'src/app.ts', isDirectory: false, size: 2, mtime: 2 },
      reasons: [],
    }] })

    useAppStore.setState({
      page: 'compare',
      compareTabs: [{
        id: 'compare-tab-1',
        title: 'left ↔ right',
        snapshot,
        diffTabs: [],
        activeDiffTabId: null,
      }],
      activeCompareTabId: 'compare-tab-1',
      diffTabs: [createDiffTab()],
      activeDiffTabId: 'src/file.txt',
    })

    useCompareStore.setState({
      ...snapshot,
      expandedDirs: new Set(['src']),
      loadingDirs: new Set(),
    })

    leaveComparePage('home')

    const appState = useAppStore.getState()
    const compareState = useCompareStore.getState()

    expect(appState.page).toBe('home')
    expect(appState.diffTabs).toEqual([])
    expect(appState.compareTabs[0]?.snapshot.entries.map((entry) => entry.relativePath)).toEqual(['src/app.ts'])
    expect(compareState.leftPath).toBe('/left')
    expect(compareState.rightPath).toBe('/right')
    expect(compareState.leftSource).toBeNull()
    expect(compareState.rightSource).toBeNull()
  })

  it('can leave compare page to another top-level section', () => {
    const snapshot = createCompareSnapshot({ scanning: true, comparing: true })

    useAppStore.setState({
      page: 'compare',
      compareTabs: [{
        id: 'compare-tab-1',
        title: 'left ↔ right',
        snapshot,
        diffTabs: [],
        activeDiffTabId: null,
      }],
      activeCompareTabId: 'compare-tab-1',
    })

    useCompareStore.setState({
      ...snapshot,
      expandedDirs: new Set(),
      loadingDirs: new Set(),
    })

    leaveComparePage('text')

    expect(useAppStore.getState().page).toBe('text')
    expect(useAppStore.getState().compareTabs[0]?.snapshot.scanning).toBe(true)
  })

  it('restores the active compare tab and can expand logs', () => {
    const snapshot = createCompareSnapshot({
      entries: [{
        relativePath: 'src/app.ts',
        name: 'app.ts',
        isDirectory: false,
        state: 'equal',
        left: { name: 'app.ts', path: 'src/app.ts', isDirectory: false, size: 1, mtime: 1 },
        right: { name: 'app.ts', path: 'src/app.ts', isDirectory: false, size: 1, mtime: 1 },
        reasons: [],
      }],
    })

    useAppStore.setState({
      page: 'text',
      compareTabs: [{
        id: 'compare-tab-1',
        title: 'left ↔ right',
        snapshot,
        diffTabs: [createDiffTab()],
        activeDiffTabId: 'src/file.txt',
      }],
      activeCompareTabId: 'compare-tab-1',
    })

    const opened = openCompareTab(undefined, { expandLogs: true })

    expect(opened).toBe(true)
    expect(useAppStore.getState().page).toBe('compare')
    expect(useCompareStore.getState().entries.map((entry) => entry.relativePath)).toEqual(['src/app.ts'])
    expect(useLogStore.getState().visible).toBe(true)
  })
})