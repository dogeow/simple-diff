// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CompareEntry, SourceConfig } from '../../../shared/types'
import ComparePage from './ComparePage'
import OverlayHost from '../components/overlays/OverlayHost'
import { useAppStore, type CompareTab } from '../stores/app-store'
import { useCompareStore, type CompareSessionSnapshot } from '../stores/compare-store'
import { useLogStore } from '../stores/log-store'
import { useSettingsStore } from '../stores/settings-store'
import { useSSHStore } from '../stores/ssh-store'
import { EMPTY_TREE_SELECTION, useUIStore } from '../stores/ui-store'

const leftSource: SourceConfig = { type: 'local', path: '/var/left' }
const rightSource: SourceConfig = { type: 'local', path: '/var/right' }

function createCompareEntry(relativePath: string): CompareEntry {
  return {
    relativePath,
    name: relativePath.split('/').at(-1) ?? relativePath,
    isDirectory: false,
    state: 'different',
    left: { name: 'app.ts', path: `/left/${relativePath}`, isDirectory: false, size: 1, mtime: 1 },
    right: { name: 'app.ts', path: `/right/${relativePath}`, isDirectory: false, size: 2, mtime: 2 },
    reasons: [{ type: 'size', leftSize: 1, rightSize: 2 }],
  }
}

function createSnapshot(overrides: Partial<CompareSessionSnapshot> = {}): CompareSessionSnapshot {
  return {
    leftPath: leftSource.path,
    rightPath: rightSource.path,
    leftSourceType: 'local',
    rightSourceType: 'local',
    leftSSHConfigId: '',
    rightSSHConfigId: '',
    strategies: ['size', 'mtime'],
    extensionFilter: [],
    hideDot: false,
    hideDotFilter: 'all',
    entries: [createCompareEntry('src/app.ts')],
    scanning: false,
    comparing: false,
    paused: false,
    done: true,
    error: null,
    duration: 123,
    leftSource,
    rightSource,
    dirtyPaths: [],
    loadingDirs: [],
    filter: 'all',
    expandedDirs: [],
    viewMode: 'split',
    activeCompareId: null,
    compareSessionId: 'compare-1',
    ...overrides,
  }
}

function createCompareTab(id: string, title: string): CompareTab {
  return { id, title, snapshot: createSnapshot(), diffTabs: [], activeDiffTabId: null }
}

function resetToSetup(): void {
  window.localStorage.clear()
  useAppStore.setState({
    page: 'compare',
    diffTabs: [],
    activeDiffTabId: null,
    compareTabs: [],
    activeCompareTabId: null,
  })
  useCompareStore.setState({
    leftPath: '',
    rightPath: '',
    leftSourceType: 'local',
    rightSourceType: 'local',
    leftSSHConfigId: '',
    rightSSHConfigId: '',
    strategies: ['size', 'mtime'],
    extensionFilter: [],
    hideDot: false,
    hideDotFilter: 'all',
    entries: [],
    scanning: false,
    comparing: false,
    paused: false,
    done: false,
    error: null,
    duration: 0,
    leftSource: null,
    rightSource: null,
    loadingDirs: new Set(),
    filter: 'all',
    expandedDirs: new Set(),
    viewMode: 'split',
    activeCompareId: null,
    compareSessionId: null,
    syncTask: null,
    compareVersion: 0,
  })
  useLogStore.setState({ logs: [], visible: false })
  useUIStore.setState({ overlay: null, treeSelection: EMPTY_TREE_SELECTION })
  useSettingsStore.setState({ globalPathFilters: [] })
  useSSHStore.setState({ configs: [], loading: false, loadConfigs: async () => undefined })
}

function installApiMock(overrides: Partial<Window['api']> = {}) {
  const api = {
    runtime: {
      mode: 'tauri' as const,
      supportsSftp: true,
      supportsHistory: true,
      supportsSync: true,
      supportsNativeFolderSelection: true,
      supportsDirectoryDragDrop: true,
      supportsWriteBack: true,
    },
    onLog: vi.fn(() => () => undefined),
    listHistory: vi.fn(async () => ({
      success: true,
      data: [{
        id: 'history-1',
        leftSource,
        rightSource,
        leftLabel: '/var/left',
        rightLabel: '/var/right',
        strategies: ['size'],
        stats: { total: 1, equal: 0, different: 1, leftOnly: 0, rightOnly: 0 },
        duration: 12,
        createdAt: 1,
      }],
    })),
    listSSHConfigs: vi.fn(async () => ({ success: true, data: [] })),
    selectFolder: vi.fn(async () => ({ success: true, data: '/var/picked' })),
    runCompare: vi.fn(async () => ({
      success: true,
      data: {
        entries: [createCompareEntry('src/app.ts')],
        stats: { total: 1, equal: 0, different: 1, leftOnly: 0, rightOnly: 0 },
        duration: 12,
      },
    })),
    cancelCompare: vi.fn(async () => ({ success: true })),
    getSyncStatus: vi.fn(async () => ({ success: true, data: null })),
    ...overrides,
  } as unknown as Window['api']

  window.api = api
  return api
}

/** 编辑数据源对话框挂在壳层的 `OverlayHost` 上，`⌘K` 才能打开它。 */
function renderWorkspaceWithOverlays() {
  return render(
    <>
      <ComparePage />
      <OverlayHost />
    </>,
  )
}

describe('compare workspace — setup 与 result 是同一个屏幕的两种状态', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    installApiMock()
    resetToSetup()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('没有对比标签时渲染 setup 面板，而不是一个独立的 Home 页面', () => {
    render(<ComparePage />)

    expect(screen.getByRole('heading', { name: '新建对比' })).toBeTruthy()
    expect(screen.getByRole('group', { name: '比较依据' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /开始对比/ })).toBeTruthy()
    // 标签栏与结果态共用一份实现，setup 态也在同一个壳里。
    expect(screen.getByRole('tablist', { name: '对比标签' })).toBeTruthy()
  })

  it('缺少输入时禁用 CTA 并说明缺什么，而不是留一个死按钮', () => {
    render(<ComparePage />)

    const cta = screen.getByRole('button', { name: /开始对比/ }) as HTMLButtonElement
    expect(cta.disabled).toBe(true)
    expect(screen.getByText('选择左右目录')).toBeTruthy()

    act(() => {
      useCompareStore.setState({ leftPath: '/a', rightPath: '/b', strategies: [] })
    })
    expect(screen.getByText('至少选择一个比较依据')).toBeTruthy()
  })

  it('首次运行的空状态带一个真正能用的动作', async () => {
    const api = installApiMock()
    const user = userEvent.setup()
    render(<ComparePage />)

    await user.click(screen.getByRole('button', { name: '选择目录…' }))

    expect(api.selectFolder).toHaveBeenCalled()
    await waitFor(() => {
      expect(useCompareStore.getState().leftPath).toBe('/var/picked')
    })
  })

  it('有结果时渲染结果区，setup 面板让位', () => {
    useAppStore.setState({
      compareTabs: [createCompareTab('compare-tab-1', '当前对比')],
      activeCompareTabId: 'compare-tab-1',
    })
    useCompareStore.setState({ ...createSnapshot(), loadingDirs: new Set(), expandedDirs: new Set(), dirtyPaths: new Set() })

    render(<ComparePage />)

    expect(screen.queryByRole('heading', { name: '新建对比' })).toBeNull()
    expect(screen.getByRole('tab', { name: '当前对比' })).toBeTruthy()
  })

  it('⌘N 把当前标签存起来并退回 setup，表单值保留', async () => {
    useAppStore.setState({
      compareTabs: [createCompareTab('compare-tab-1', '当前对比')],
      activeCompareTabId: 'compare-tab-1',
    })
    useCompareStore.setState({ ...createSnapshot(), loadingDirs: new Set(), expandedDirs: new Set(), dirtyPaths: new Set() })

    const user = userEvent.setup()
    render(<ComparePage />)

    await user.keyboard('{Meta>}n{/Meta}')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '新建对比' })).toBeTruthy()
    })
    expect(useAppStore.getState().activeCompareTabId).toBeNull()
    // 标签还在，结果没有被销毁（F4）。
    expect(useAppStore.getState().compareTabs.map((tab) => tab.id)).toEqual(['compare-tab-1'])
    expect(useCompareStore.getState().leftPath).toBe('/var/left')
  })

  it('⌘1 跳到第一个对比标签', async () => {
    useAppStore.setState({
      compareTabs: [createCompareTab('compare-tab-1', '第一个'), createCompareTab('compare-tab-2', '第二个')],
      activeCompareTabId: 'compare-tab-2',
    })
    useCompareStore.setState({ ...createSnapshot(), loadingDirs: new Set(), expandedDirs: new Set(), dirtyPaths: new Set() })

    const user = userEvent.setup()
    render(<ComparePage />)

    await user.keyboard('{Meta>}1{/Meta}')

    await waitFor(() => {
      expect(useAppStore.getState().activeCompareTabId).toBe('compare-tab-1')
    })
  })

  it('⇧⌘W 关闭当前对比标签，关掉最后一个后落回 setup', async () => {
    useAppStore.setState({
      compareTabs: [createCompareTab('compare-tab-1', '当前对比')],
      activeCompareTabId: 'compare-tab-1',
    })
    useCompareStore.setState({ ...createSnapshot(), loadingDirs: new Set(), expandedDirs: new Set(), dirtyPaths: new Set() })

    const user = userEvent.setup()
    render(<ComparePage />)

    await user.keyboard('{Shift>}{Meta>}w{/Meta}{/Shift}')

    await waitFor(() => {
      expect(useAppStore.getState().compareTabs).toEqual([])
    })
    expect(useAppStore.getState().activeCompareTabId).toBeNull()
    expect(await screen.findByRole('heading', { name: '新建对比' })).toBeTruthy()
  })

  it('E 打开数据源编辑对话框，复用同一个 setup 面板', async () => {
    useAppStore.setState({
      compareTabs: [createCompareTab('compare-tab-1', '当前对比')],
      activeCompareTabId: 'compare-tab-1',
    })
    useCompareStore.setState({ ...createSnapshot(), loadingDirs: new Set(), expandedDirs: new Set(), dirtyPaths: new Set() })

    const user = userEvent.setup()
    renderWorkspaceWithOverlays()

    await user.keyboard('e')

    const dialog = await screen.findByRole('dialog', { name: '编辑数据源' })
    expect(dialog).toBeTruthy()
    expect(screen.getByRole('button', { name: /应用并重新对比/ })).toBeTruthy()
  })

  it('新建对比 ▾ 的最近对比直接跑一次对比，而不是只预填表单', async () => {
    const api = installApiMock()
    const user = userEvent.setup()
    render(<ComparePage />)

    await waitFor(() => {
      expect(api.listHistory).toHaveBeenCalled()
    })

    await user.click(screen.getByRole('button', { name: '最近对比' }))
    await user.click(await screen.findByRole('menuitem', { name: '本地:left ↔ 本地:right' }))

    await waitFor(() => {
      expect(api.runCompare).toHaveBeenCalled()
    })
    expect(useCompareStore.getState().leftPath).toBe('/var/left')
  })

  it('最近对比开的是新标签，不会把历史路径写进上一个标签的快照', async () => {
    const api = installApiMock()
    useAppStore.setState({
      compareTabs: [createCompareTab('compare-tab-1', '当前对比')],
      activeCompareTabId: 'compare-tab-1',
    })
    useCompareStore.setState({
      ...createSnapshot({ leftPath: '/keep-left', rightPath: '/keep-right' }),
      loadingDirs: new Set(),
      expandedDirs: new Set(),
      dirtyPaths: new Set(),
    })

    const user = userEvent.setup()
    render(<ComparePage />)

    await waitFor(() => {
      expect(api.listHistory).toHaveBeenCalled()
    })

    await user.click(screen.getByRole('button', { name: '最近对比' }))
    await user.click(await screen.findByRole('menuitem', { name: '本地:left ↔ 本地:right' }))

    await waitFor(() => {
      expect(api.runCompare).toHaveBeenCalled()
    })

    const appState = useAppStore.getState()
    const previousTab = appState.compareTabs.find((tab) => tab.id === 'compare-tab-1')
    expect(previousTab?.snapshot.leftPath).toBe('/keep-left')
    expect(appState.activeCompareTabId).not.toBe('compare-tab-1')
  })

  it('在路径框里按 Enter 等同于按下开始对比', async () => {
    const api = installApiMock()
    const user = userEvent.setup()
    render(<ComparePage />)

    const pathInputs = screen.getAllByPlaceholderText('选择或拖入目录路径...')
    await user.click(pathInputs[0])
    await user.paste('/var/left')
    await user.click(pathInputs[1])
    await user.paste('/var/right')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(api.runCompare).toHaveBeenCalled()
    })
  })

  it('输入不完整时 Enter 不会发起对比', async () => {
    const api = installApiMock()
    const user = userEvent.setup()
    render(<ComparePage />)

    const pathInputs = screen.getAllByPlaceholderText('选择或拖入目录路径...')
    await user.click(pathInputs[0])
    await user.paste('/var/left')
    await user.keyboard('{Enter}')

    expect(api.runCompare).not.toHaveBeenCalled()
  })

  it('F3：编辑数据源对话框取消后什么都不改', async () => {
    useAppStore.setState({
      compareTabs: [createCompareTab('compare-tab-1', '当前对比')],
      activeCompareTabId: 'compare-tab-1',
    })
    useCompareStore.setState({ ...createSnapshot(), loadingDirs: new Set(), expandedDirs: new Set(), dirtyPaths: new Set() })

    const user = userEvent.setup()
    renderWorkspaceWithOverlays()

    await user.keyboard('e')
    await screen.findByRole('dialog', { name: '编辑数据源' })

    act(() => {
      useCompareStore.getState().setLeftPath('/var/edited')
    })
    expect(useCompareStore.getState().leftPath).toBe('/var/edited')

    await user.click(screen.getByRole('button', { name: '关闭' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '编辑数据源' })).toBeNull()
    })
    expect(useCompareStore.getState().leftPath).toBe('/var/left')
  })

  it('F3：编辑数据源对话框确认后重跑到同一个标签', async () => {
    const api = installApiMock()
    useAppStore.setState({
      compareTabs: [createCompareTab('compare-tab-1', '当前对比')],
      activeCompareTabId: 'compare-tab-1',
    })
    useCompareStore.setState({ ...createSnapshot(), loadingDirs: new Set(), expandedDirs: new Set(), dirtyPaths: new Set() })

    const user = userEvent.setup()
    renderWorkspaceWithOverlays()

    await user.keyboard('e')
    await screen.findByRole('dialog', { name: '编辑数据源' })

    act(() => {
      useCompareStore.getState().setLeftPath('/var/edited')
    })

    await user.click(screen.getByRole('button', { name: /应用并重新对比/ }))

    await waitFor(() => {
      expect(api.runCompare).toHaveBeenCalled()
    })
    expect(useAppStore.getState().activeCompareTabId).toBe('compare-tab-1')
    expect(useCompareStore.getState().leftPath).toBe('/var/edited')
  })
})
