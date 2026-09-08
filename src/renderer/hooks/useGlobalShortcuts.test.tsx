// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { useGlobalShortcuts } from './useGlobalShortcuts'
import { useAppStore } from '../stores/app-store'
import { useCompareStore } from '../stores/compare-store'
import { useLogStore } from '../stores/log-store'
import { EMPTY_TREE_SELECTION, useUIStore } from '../stores/ui-store'
import type { SourceConfig, SyncTaskSnapshot } from '../../../shared/types'

const LEFT_SOURCE: SourceConfig = { type: 'local', path: '/var/left' }
const RIGHT_SOURCE: SourceConfig = { type: 'local', path: '/var/right' }

function Host() {
  useGlobalShortcuts()
  return null
}

function installApiMock() {
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
    runCompare: vi.fn(() => new Promise(() => undefined)),
    cancelCompare: vi.fn(async () => ({ success: true })),
    pauseSync: vi.fn(async () => ({ success: true, data: null })),
  } as unknown as Window['api']

  window.api = api
  return api
}

function createSyncTask(overrides: Partial<SyncTaskSnapshot> = {}): SyncTaskSnapshot {
  return {
    id: 'sync-1',
    leftSource: LEFT_SOURCE,
    rightSource: RIGHT_SOURCE,
    direction: 'left_to_right',
    status: 'running',
    totalItems: 10,
    completedItems: 3,
    currentPath: null,
    lastCompletedPath: null,
    lastError: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

beforeEach(() => {
  installApiMock()
  useAppStore.setState({
    page: 'compare',
    diffTabs: [],
    activeDiffTabId: null,
    compareTabs: [{
      id: 'tab-1',
      title: '本地:left ↔ 本地:right',
      snapshot: useCompareStore.getState().createTabSnapshot(),
      diffTabs: [],
      activeDiffTabId: null,
    }],
    activeCompareTabId: 'tab-1',
  })
  useCompareStore.setState({
    leftPath: LEFT_SOURCE.path,
    rightPath: RIGHT_SOURCE.path,
    leftSource: LEFT_SOURCE,
    rightSource: RIGHT_SOURCE,
    strategies: ['size'],
    scanning: false,
    comparing: false,
    paused: false,
    done: true,
    entries: [],
    activeCompareId: null,
    syncTask: null,
  })
  useLogStore.setState({ logs: [], visible: false })
  useUIStore.setState({
    overlay: null,
    filterPopoverOpen: false,
    pendingDiffTabClose: null,
    treeSelection: EMPTY_TREE_SELECTION,
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useGlobalShortcuts — 壳层这一组', () => {
  it('⌘K 只打开命令面板，重复按不会把它切掉', () => {
    render(<Host />)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(useUIStore.getState().overlay).toBe('palette')

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(useUIStore.getState().overlay).toBe('palette')
  })

  it('⌘, 打开设置，⌘J 切换日志面板', () => {
    render(<Host />)

    fireEvent.keyDown(window, { key: ',', metaKey: true })
    expect(useUIStore.getState().overlay).toBe('settings')

    fireEvent.keyDown(window, { key: 'j', metaKey: true })
    expect(useLogStore.getState().visible).toBe(true)
  })

  it('? 在输入框里不抢键', () => {
    render(<Host />)
    const input = document.createElement('input')
    document.body.append(input)

    fireEvent.keyDown(input, { key: '?' })
    expect(useUIStore.getState().overlay).toBeNull()

    fireEvent.keyDown(window, { key: '?' })
    expect(useUIStore.getState().overlay).toBe('shortcuts')

    input.remove()
  })
})

describe('useGlobalShortcuts — 对比作业这一组', () => {
  it('⌘R 重启当前对比', async () => {
    const api = installApiMock()
    render(<Host />)

    fireEvent.keyDown(window, { key: 'r', metaKey: true })

    await waitFor(() => expect(api.runCompare).toHaveBeenCalledTimes(1))
  })

  it('⌘R 在没有比较依据时什么都不做', async () => {
    const api = installApiMock()
    useCompareStore.setState({ strategies: [] })
    render(<Host />)

    fireEvent.keyDown(window, { key: 'r', metaKey: true })

    await Promise.resolve()
    expect(api.runCompare).not.toHaveBeenCalled()
  })

  it('⌘. 暂停正在跑的对比', async () => {
    const api = installApiMock()
    useCompareStore.setState({ scanning: true, comparing: true, done: false, activeCompareId: 'compare-1' })
    render(<Host />)

    fireEvent.keyDown(window, { key: '.', metaKey: true })

    await waitFor(() => expect(api.cancelCompare).toHaveBeenCalledWith('compare-1'))
  })

  it('对比没在跑时 ⌘. 落到本标签的同步任务上', async () => {
    const api = installApiMock()
    useCompareStore.setState({ syncTask: createSyncTask() })
    render(<Host />)

    fireEvent.keyDown(window, { key: '.', metaKey: true })

    await waitFor(() => expect(api.pauseSync).toHaveBeenCalledTimes(1))
  })

  it('⌘F 打开会话过滤弹层', () => {
    render(<Host />)

    fireEvent.keyDown(window, { key: 'f', metaKey: true })

    expect(useUIStore.getState().filterPopoverOpen).toBe(true)
  })

  it('文件 Diff 态下 ⌘F 查找当前文件而保留目录标签状态', () => {
    // 过滤弹层住在 `CompareToolbar` 里，而它在有活动 diff 标签时根本不渲染：
    // 只翻 `filterPopoverOpen` 的话，这一按在用户眼里就是没反应。
    useAppStore.setState({
      diffTabs: [{
        id: 'a.txt',
        sessionId: 's1',
        relativePath: 'a.txt',
        fileName: 'a.txt',
        hasLeftFile: true,
        hasRightFile: true,
        leftSource: LEFT_SOURCE,
        rightSource: RIGHT_SOURCE,
        leftFullPath: '/left/a.txt',
        rightFullPath: '/right/a.txt',
        leftContent: 'a',
        rightContent: 'b',
        originalLeftContent: 'a',
        originalRightContent: 'b',
        diffResult: null,
        loadError: null,
        loading: false,
      }],
      activeDiffTabId: 'a.txt',
    })
    render(<Host />)

    fireEvent.keyDown(window, { key: 'f', metaKey: true })

    expect(useAppStore.getState().activeDiffTabId).toBe('a.txt')
    expect(useUIStore.getState().fileSearchOpen).toBe(true)
    expect(useUIStore.getState().filterPopoverOpen).toBe(false)
  })

  it('叠加层占据屏幕时不抢 ⌘R / ⌘F / ⌘.', async () => {
    const api = installApiMock()
    useUIStore.setState({ overlay: 'settings' })
    render(<Host />)

    fireEvent.keyDown(window, { key: 'r', metaKey: true })
    fireEvent.keyDown(window, { key: 'f', metaKey: true })

    await Promise.resolve()
    expect(api.runCompare).not.toHaveBeenCalled()
    expect(useUIStore.getState().filterPopoverOpen).toBe(false)
  })

  it('文本模式下对比作业那一组不生效，壳层那一组照常', async () => {
    const api = installApiMock()
    useAppStore.setState({ page: 'text' })
    render(<Host />)

    fireEvent.keyDown(window, { key: 'r', metaKey: true })
    await Promise.resolve()
    expect(api.runCompare).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(useUIStore.getState().overlay).toBe('palette')
  })

  it('重跑前先收掉指向旧结果的文件 Diff 标签', async () => {
    useAppStore.setState({
      diffTabs: [{
        id: 'src/app.ts',
        sessionId: 's1',
        relativePath: 'src/app.ts',
        fileName: 'app.ts',
        hasLeftFile: true,
        hasRightFile: true,
        leftSource: LEFT_SOURCE,
        rightSource: RIGHT_SOURCE,
        leftFullPath: '/var/left/src/app.ts',
        rightFullPath: '/var/right/src/app.ts',
        leftContent: '',
        rightContent: '',
        originalLeftContent: '',
        originalRightContent: '',
        diffResult: null,
        loadError: null,
        loading: false,
      }],
      activeDiffTabId: 'src/app.ts',
    })
    render(<Host />)

    fireEvent.keyDown(window, { key: 'r', metaKey: true })

    await waitFor(() => expect(useAppStore.getState().diffTabs).toHaveLength(0))
    expect(useAppStore.getState().activeDiffTabId).toBeNull()
  })
})

/**
 * chunk 7 的文件 Diff 组（chunk 10 扫描项：「§5 里的每一条绑定都要真的生效」）。
 * 这些键住在全局层而不是 `FileDiffView` 里：`⌘W` / `⌥←→` 在目录树态也得管用。
 */
describe('useGlobalShortcuts — 文件 Diff 这一组', () => {
  function diffTab(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      sessionId: 's1',
      relativePath: `src/${id}`,
      fileName: id,
      hasLeftFile: true,
      hasRightFile: true,
      leftSource: LEFT_SOURCE,
      rightSource: RIGHT_SOURCE,
      leftFullPath: `/var/left/src/${id}`,
      rightFullPath: `/var/right/src/${id}`,
      leftContent: 'a',
      rightContent: 'b',
      originalLeftContent: 'a',
      originalRightContent: 'b',
      diffResult: null,
      loadError: null,
      loading: false,
      ...overrides,
    }
  }

  it('⌘S / ⇧⌘S 保存活动标签的左右两侧', async () => {
    const writeText = vi.fn(async () => ({ success: true }))
    window.api = { ...window.api, writeText } as unknown as Window['api']
    useAppStore.setState({
      diffTabs: [diffTab('a.ts', { leftContent: 'changed', rightContent: 'changed-r' })],
      activeDiffTabId: 'a.ts',
    })
    render(<Host />)

    fireEvent.keyDown(window, { key: 's', metaKey: true })
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LEFT_SOURCE, '/var/left/src/a.ts', 'changed', { content: 'a', exists: true }))

    fireEvent.keyDown(window, { key: 'S', metaKey: true, shiftKey: true })
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(RIGHT_SOURCE, '/var/right/src/a.ts', 'changed-r', { content: 'b', exists: true }))
  })

  it('⌘W 直接关掉干净的标签', () => {
    useAppStore.setState({ diffTabs: [diffTab('a.ts')], activeDiffTabId: 'a.ts' })
    render(<Host />)

    fireEvent.keyDown(window, { key: 'w', metaKey: true })

    expect(useAppStore.getState().diffTabs).toHaveLength(0)
    expect(useUIStore.getState().pendingDiffTabClose).toBeNull()
  })

  it('⌘W 关脏标签时先要一次确认，而不是直接丢掉改动', () => {
    useAppStore.setState({
      diffTabs: [diffTab('a.ts', { leftContent: 'edited' })],
      activeDiffTabId: 'a.ts',
    })
    render(<Host />)

    fireEvent.keyDown(window, { key: 'w', metaKey: true })

    expect(useAppStore.getState().diffTabs).toHaveLength(1)
    expect(useUIStore.getState().pendingDiffTabClose).toEqual(['a.ts'])
  })

  it('⌘0 回到目录树；⌥← / ⌥→ 把目录树也算作一站来回循环', () => {
    useAppStore.setState({
      diffTabs: [diffTab('a.ts'), diffTab('b.ts')],
      activeDiffTabId: 'a.ts',
    })
    render(<Host />)

    fireEvent.keyDown(window, { key: '0', metaKey: true })
    expect(useAppStore.getState().activeDiffTabId).toBeNull()

    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true })
    expect(useAppStore.getState().activeDiffTabId).toBe('a.ts')

    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true })
    expect(useAppStore.getState().activeDiffTabId).toBe('b.ts')

    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true })
    expect(useAppStore.getState().activeDiffTabId).toBe('a.ts')
  })

  it('⇧⌘W 不会被 ⌘W 抢走（前者是关对比标签，归 useCompareTabShortcuts）', () => {
    useAppStore.setState({ diffTabs: [diffTab('a.ts')], activeDiffTabId: 'a.ts' })
    render(<Host />)

    fireEvent.keyDown(window, { key: 'w', metaKey: true, shiftKey: true })

    expect(useAppStore.getState().diffTabs).toHaveLength(1)
  })
})
