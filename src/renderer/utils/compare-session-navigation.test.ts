import { beforeEach, describe, expect, it } from 'vitest'
import type { CompareEntry, SourceConfig, SyncTaskSnapshot } from '../../../shared/types'
import { openCompareTab, openSyncTaskView, startNewCompareSession } from './compare-session-navigation'
import { useAppStore, type DiffTab } from '../stores/app-store'
import { hasCompareSessionContent, useCompareStore, type CompareSessionSnapshot } from '../stores/compare-store'
import { useLogStore } from '../stores/log-store'
import { useUIStore } from '../stores/ui-store'

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
    dirtyPaths: [],
    loadingDirs: [],
    filter: 'all',
    expandedDirs: [],
    viewMode: 'split',
    activeCompareId: 'compare-1',
    ...overrides,
  }
}

function createEntry(relativePath: string): CompareEntry {
  return {
    relativePath,
    name: relativePath.split('/').at(-1) ?? relativePath,
    isDirectory: false,
    state: 'equal',
    left: { name: 'app.ts', path: relativePath, isDirectory: false, size: 1, mtime: 1 },
    right: { name: 'app.ts', path: relativePath, isDirectory: false, size: 1, mtime: 1 },
    reasons: [],
  }
}

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

function createSyncTask(leftSource: SourceConfig, rightSource: SourceConfig): SyncTaskSnapshot {
  return {
    id: 'sync-task-1',
    leftSource,
    rightSource,
    direction: 'left_to_right',
    status: 'running',
    totalItems: 10,
    completedItems: 3,
    currentPath: '/left/src/app.ts',
    lastCompletedPath: null,
    lastError: null,
    createdAt: 1,
    updatedAt: 2,
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
    extensionFilter: ['node_modules', '.git', 'dist', '.DS_Store'],
    hideDot: true,
    hideDotFilter: 'all',
  })

  useLogStore.setState({ logs: [], visible: false })
  useUIStore.setState({ overlay: null })
}

describe('compare session navigation', () => {
  beforeEach(() => {
    resetStores()
  })

  it('persists the active compare tab and falls back to the setup state', () => {
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
      dirtyPaths: new Set<string>(),
      expandedDirs: new Set(['src']),
      loadingDirs: new Set(),
    })

    startNewCompareSession()

    const appState = useAppStore.getState()
    const compareState = useCompareStore.getState()

    // chunk 5：不再有 home 页面；新建对比只是把工作区退回 setup 态。
    expect(appState.page).toBe('compare')
    expect(appState.activeCompareTabId).toBeNull()
    expect(appState.diffTabs).toEqual([])
    expect(appState.compareTabs[0]?.snapshot.entries.map((entry) => entry.relativePath)).toEqual(['src/app.ts'])
    expect(compareState.leftPath).toBe('/left')
    expect(compareState.rightPath).toBe('/right')
    expect(compareState.leftSource).toBeNull()
    expect(compareState.rightSource).toBeNull()
    expect(hasCompareSessionContent(compareState.createSnapshot())).toBe(false)
  })

  it('keeps a running compare in its own tab when starting a new one', () => {
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
      dirtyPaths: new Set<string>(),
      expandedDirs: new Set(),
      loadingDirs: new Set(),
    })

    startNewCompareSession()

    expect(useAppStore.getState().page).toBe('compare')
    expect(useAppStore.getState().compareTabs[0]?.snapshot.scanning).toBe(true)
    expect(useAppStore.getState().activeCompareTabId).toBeNull()
  })

  it('drops the sync task sources so a new session really starts empty', () => {
    const syncLeftSource: SourceConfig = { type: 'local', path: '/sync-left' }
    const syncRightSource: SourceConfig = { type: 'local', path: '/sync-right' }

    useCompareStore.setState({
      syncTask: createSyncTask(syncLeftSource, syncRightSource),
      leftSource: syncLeftSource,
      rightSource: syncRightSource,
      done: true,
    })

    startNewCompareSession()

    const compareState = useCompareStore.getState()
    expect(compareState.leftSource).toBeNull()
    expect(compareState.rightSource).toBeNull()
    expect(hasCompareSessionContent(compareState.createSnapshot())).toBe(false)
  })

  it('shows the workspace without overwriting the live session from a lightweight snapshot', () => {
    // 对比完成后写回标签的是 lightweight 快照（`entries: []`）。回到工作区时再
    // restore 一次会把整棵结果树清空——F4 的“不要销毁工作上下文”就是指这个。
    useAppStore.setState({
      page: 'text',
      compareTabs: [{
        id: 'compare-tab-1',
        title: 'left ↔ right',
        snapshot: createCompareSnapshot({ entries: [] }),
        diffTabs: [createDiffTab()],
        activeDiffTabId: 'src/file.txt',
      }],
      activeCompareTabId: 'compare-tab-1',
    })

    useCompareStore.setState({ entries: [createEntry('src/app.ts')] })

    const opened = openCompareTab()

    expect(opened).toBe(true)
    expect(useAppStore.getState().page).toBe('compare')
    expect(useCompareStore.getState().entries.map((entry) => entry.relativePath)).toEqual(['src/app.ts'])
    // F9：导航不再强开日志面板。
    expect(useLogStore.getState().visible).toBe(false)
  })

  it('keeps the setup state instead of falling back to the last compare tab', () => {
    useAppStore.setState({
      page: 'text',
      compareTabs: [{
        id: 'compare-tab-1',
        title: 'left ↔ right',
        snapshot: createCompareSnapshot(),
        diffTabs: [],
        activeDiffTabId: null,
      }],
      activeCompareTabId: null,
    })

    useCompareStore.setState({ leftPath: '/drafting-left', rightPath: '/drafting-right' })

    const opened = openCompareTab()

    // 「目录对比」只有一个含义：显示工作区。setup 态不能被悄悄换成一个旧结果。
    expect(opened).toBe(false)
    expect(useAppStore.getState().page).toBe('compare')
    expect(useAppStore.getState().activeCompareTabId).toBeNull()
    expect(useCompareStore.getState().leftPath).toBe('/drafting-left')
  })

  it('persists the outgoing session before restoring another compare tab', () => {
    useAppStore.setState({
      page: 'compare',
      compareTabs: [
        {
          id: 'compare-tab-1',
          title: 'left ↔ right',
          snapshot: createCompareSnapshot({ entries: [] }),
          diffTabs: [],
          activeDiffTabId: null,
        },
        {
          id: 'compare-tab-2',
          title: 'other ↔ other',
          snapshot: createCompareSnapshot({ leftPath: '/other-left', rightPath: '/other-right' }),
          diffTabs: [],
          activeDiffTabId: null,
        },
      ],
      activeCompareTabId: 'compare-tab-1',
    })

    useCompareStore.setState({
      ...createCompareSnapshot(),
      entries: [createEntry('src/app.ts')],
      dirtyPaths: new Set<string>(),
      expandedDirs: new Set(['src']),
      loadingDirs: new Set(),
    })

    expect(openCompareTab('compare-tab-2')).toBe(true)

    const appState = useAppStore.getState()
    expect(appState.activeCompareTabId).toBe('compare-tab-2')
    // 离开的标签拿到的是它自己的 live 内容，而不是被留在一个空快照上。
    expect(appState.compareTabs[0]?.snapshot.entries.map((entry) => entry.relativePath)).toEqual(['src/app.ts'])
    expect(useCompareStore.getState().leftPath).toBe('/other-left')
  })

  it('does nothing when reopening the compare tab that is already active', () => {
    useAppStore.setState({
      page: 'compare',
      compareTabs: [{
        id: 'compare-tab-1',
        title: 'left ↔ right',
        snapshot: createCompareSnapshot({ entries: [] }),
        diffTabs: [],
        activeDiffTabId: null,
      }],
      activeCompareTabId: 'compare-tab-1',
    })

    useCompareStore.setState({ entries: [createEntry('src/app.ts')] })

    expect(openCompareTab('compare-tab-1')).toBe(true)
    expect(useCompareStore.getState().entries.map((entry) => entry.relativePath)).toEqual(['src/app.ts'])
  })

  it('opens the compare tab matching the active sync task sources', () => {
    const syncLeftSource: SourceConfig = { type: 'sftp', configId: 'dogeow', path: '/var/www/dogeow-api-next' }
    const syncRightSource: SourceConfig = { type: 'sftp', configId: 'hermes', path: '/var/www/dogeow-api' }

    useAppStore.setState({
      page: 'compare',
      compareTabs: [
        {
          id: 'compare-tab-other',
          title: 'other ↔ other',
          snapshot: createCompareSnapshot({
            leftPath: '/other-left',
            rightPath: '/other-right',
            leftSource: { type: 'local', path: '/other-left' },
            rightSource: { type: 'local', path: '/other-right' },
            activeCompareId: null,
          }),
          diffTabs: [],
          activeDiffTabId: null,
        },
        {
          id: 'compare-tab-sync',
          title: 'dogeow-api-next ↔ dogeow-api',
          snapshot: createCompareSnapshot({
            leftPath: syncLeftSource.path,
            rightPath: syncRightSource.path,
            leftSourceType: 'sftp',
            rightSourceType: 'sftp',
            leftSSHConfigId: 'dogeow',
            rightSSHConfigId: 'hermes',
            leftSource: syncLeftSource,
            rightSource: syncRightSource,
            activeCompareId: null,
          }),
          diffTabs: [createDiffTab()],
          activeDiffTabId: 'src/file.txt',
        },
      ],
      activeCompareTabId: 'compare-tab-other',
    })

    useCompareStore.setState({
      syncTask: createSyncTask(syncLeftSource, syncRightSource),
    })

    const opened = openSyncTaskView()

    expect(opened).toBe(true)
    // F7：同步任务不再是页面，而是壳层的叠加层；对比标签被聚焦。
    expect(useAppStore.getState().page).toBe('compare')
    expect(useUIStore.getState().overlay).toBe('sync')
    expect(useAppStore.getState().activeCompareTabId).toBe('compare-tab-sync')
    expect(useAppStore.getState().diffTabs.map((tab) => tab.id)).toEqual(['src/file.txt'])
    expect(useCompareStore.getState().leftSource).toEqual(syncLeftSource)
    expect(useCompareStore.getState().rightSource).toEqual(syncRightSource)
    expect(useLogStore.getState().visible).toBe(false)
  })
})