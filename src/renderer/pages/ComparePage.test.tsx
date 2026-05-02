// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CompareEntry, FileEntry, SourceConfig } from '../../../shared/types'
import Layout from '../components/Layout'
import ComparePage from './ComparePage'
import { useAppStore, type CompareTab } from '../stores/app-store'
import { useCompareStore, type CompareSessionSnapshot } from '../stores/compare-store'
import { useLogStore } from '../stores/log-store'
import { useSettingsStore } from '../stores/settings-store'
import { useSSHStore } from '../stores/ssh-store'

function createFileEntry(name: string, path: string): FileEntry {
  return {
    name,
    path,
    isDirectory: false,
    size: 1,
    mtime: 1,
  }
}

function createDirectoryEntry(name: string, path: string): FileEntry {
  return {
    name,
    path,
    isDirectory: true,
    size: 0,
    mtime: 1,
  }
}

function createCompareEntry(relativePath: string): CompareEntry {
  return {
    relativePath,
    name: relativePath.split('/').at(-1) ?? relativePath,
    isDirectory: false,
    state: 'different',
    left: createFileEntry('app.ts', `/left/${relativePath}`),
    right: createFileEntry('app.ts', `/right/${relativePath}`),
    reasons: [{ type: 'size', leftSize: 1, rightSize: 2 }],
  }
}

function createCompareDirectory(relativePath: string, state: CompareEntry['state'] = 'equal'): CompareEntry {
  const name = relativePath.split('/').at(-1) ?? relativePath

  return {
    relativePath,
    name,
    isDirectory: true,
    state,
    left: createDirectoryEntry(name, `/left/${relativePath}`),
    right: createDirectoryEntry(name, `/right/${relativePath}`),
    reasons: [],
  }
}

const leftSource: SourceConfig = { type: 'local', path: '/var/old-left' }
const rightSource: SourceConfig = { type: 'local', path: '/var/old-right' }

function createSnapshot(overrides: Partial<CompareSessionSnapshot> = {}): CompareSessionSnapshot {
  return {
    leftPath: leftSource.path,
    rightPath: rightSource.path,
    leftSourceType: 'local',
    rightSourceType: 'local',
    leftSSHConfigId: '',
    rightSSHConfigId: '',
    strategies: ['size', 'mtime'],
    extensionFilter: ['node_modules'],
    hideDot: true,
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
    loadingDirs: [],
    filter: 'all',
    expandedDirs: [],
    viewMode: 'split',
    activeCompareId: null,
    ...overrides,
  }
}

function resetStores(compareTabs: readonly CompareTab[] = []): void {
  window.localStorage.clear()

  useAppStore.setState({
    page: 'compare',
    diffTabs: [],
    activeDiffTabId: null,
    compareTabs: [...compareTabs],
    activeCompareTabId: compareTabs[0]?.id ?? null,
  })

  useCompareStore.setState({
    leftPath: leftSource.path,
    rightPath: rightSource.path,
    leftSourceType: 'local',
    rightSourceType: 'local',
    leftSSHConfigId: '',
    rightSSHConfigId: '',
    strategies: ['size', 'mtime'],
    extensionFilter: ['node_modules'],
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
    loadingDirs: new Set(),
    filter: 'all',
    expandedDirs: new Set(),
    viewMode: 'split',
    activeCompareId: null,
    syncTask: null,
    compareVersion: 0,
  })

  useLogStore.setState({ logs: [], visible: false })
  useSettingsStore.setState({ globalPathFilters: [] })
  useSSHStore.setState({ configs: [], loading: false, loadConfigs: async () => undefined })
}

function installApiMock(overrides: Partial<Window['api']> = {}) {
  const api = {
    onLog: vi.fn(() => () => undefined),
    readText: vi.fn(async () => ({ success: true, data: 'alpha' })),
    textDiff: vi.fn(async () => ({
      success: true,
      data: {
        leftLines: [{ type: 'equal', content: 'alpha', lineNumber: 1 }],
        rightLines: [{ type: 'equal', content: 'alpha', lineNumber: 1 }],
      },
    })),
    runCompare: vi.fn(async () => ({
      success: true,
      data: {
        entries: [createCompareEntry('src/app.ts')],
        stats: { total: 1, equal: 0, different: 1, leftOnly: 0, rightOnly: 0 },
        duration: 123,
      },
    })),
    cancelCompare: vi.fn(async () => ({ success: true })),
    clearSync: vi.fn(async () => ({ success: true })),
    getSyncStatus: vi.fn(async () => ({ success: true, data: null })),
    onEntryUpdate: vi.fn(() => () => undefined),
    onScanComplete: vi.fn(() => () => undefined),
    onSyncProgress: vi.fn(() => () => undefined),
    pauseSync: vi.fn(async () => ({ success: true, data: null })),
    resumeSync: vi.fn(async () => ({ success: true, data: null })),
    startSync: vi.fn(async () => ({ success: true, data: null })),
    ...overrides,
  } as unknown as Window['api']

  window.api = api
  return api
}

describe('ComparePage renderer interactions', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    installApiMock()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('expands the log panel when clicking the current compare tab', async () => {
    resetStores([
      {
        id: 'compare-tab-1',
        title: '当前对比',
        snapshot: createSnapshot(),
        diffTabs: [],
        activeDiffTabId: null,
      },
    ])

    const user = userEvent.setup()
    render(
      <Layout>
        <ComparePage />
      </Layout>,
    )

    expect(screen.queryByText('暂无日志')).toBeNull()

    await user.click(screen.getByRole('button', { name: '当前对比' }))

    expect(await screen.findByText('暂无日志')).toBeTruthy()
    expect(useLogStore.getState().visible).toBe(true)
  })

  it('shows 首次对比 after submitting a new source path with Enter', async () => {
    resetStores([
      {
        id: 'compare-tab-1',
        title: '路径测试',
        snapshot: createSnapshot(),
        diffTabs: [],
        activeDiffTabId: null,
      },
    ])

    const user = userEvent.setup()
    render(<ComparePage />)

    expect(screen.getByRole('button', { name: '重启对比' })).toBeTruthy()

    await user.click(screen.getByTitle('/var/old-left'))

    const input = screen.getByDisplayValue('/var/old-left')
    await user.clear(input)
    await user.type(input, '/var/new-left{enter}')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '首次对比' })).toBeTruthy()
    })

    expect(useCompareStore.getState().leftPath).toBe('/var/new-left')
    expect(useCompareStore.getState().done).toBe(false)
    expect(useCompareStore.getState().entries).toEqual([])
  })

  it('hides ignored exact-path entries from both split panes immediately', () => {
    resetStores()
    useCompareStore.setState({
      entries: [
        createCompareDirectory('config'),
        createCompareEntry('config/app.php'),
        createCompareEntry('readme.md'),
      ],
      extensionFilter: ['path:config'],
      expandedDirs: new Set(['config']),
    })

    render(<ComparePage />)

    expect(screen.queryByText('config')).toBeNull()
    expect(screen.queryByText('app.php')).toBeNull()
    expect(screen.getAllByText('readme.md')).toHaveLength(2)
  })

  it('does not restart compare when adding an ignore filter', async () => {
    resetStores()
    const api = installApiMock()
    useCompareStore.setState({
      viewMode: 'merged',
      extensionFilter: ['node_modules'],
      entries: [
        createCompareDirectory('config'),
        createCompareEntry('config/app.php'),
        createCompareEntry('readme.md'),
      ],
      expandedDirs: new Set(['config']),
    })

    render(<ComparePage />)

    fireEvent.contextMenu(screen.getByText('config').closest('tr')!)
    fireEvent.click(await screen.findByRole('button', { name: '忽略目录：『config』' }))

    await waitFor(() => {
      expect(useCompareStore.getState().extensionFilter).toContain('path:config')
    })
    expect(api.runCompare).not.toHaveBeenCalled()
  })

  it('shows a file read error instead of treating a failed side as empty content', async () => {
    const api = installApiMock({
      readText: vi.fn(async (source) => {
        if (source.path === '/var/old-left') {
          return { success: false, error: 'channel closed' }
        }

        return { success: true, data: '<?php echo 1;' }
      }),
    })
    resetStores()

    const user = userEvent.setup()
    render(<ComparePage />)

    await user.dblClick(screen.getAllByText('app.ts')[0])

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('左侧本地文件读取失败')
      expect(screen.getByRole('alert').textContent).toContain('读取过程已中断或超时')
    })
    expect(api.textDiff).not.toHaveBeenCalled()
  })

  it('shows exact path filters in the modal without the path prefix', async () => {
    resetStores()
    useCompareStore.setState({ extensionFilter: ['path:bootstrap', 'node_modules'] })

    const user = userEvent.setup()
    render(<ComparePage />)

    await user.click(screen.getByRole('button', { name: '过滤 (2)' }))

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('bootstrap\nnode_modules')
  })

  it('shows file and directory names in ignore context menus', async () => {
    resetStores()
    useCompareStore.setState({
      viewMode: 'merged',
      entries: [
        createCompareDirectory('config'),
        createCompareEntry('app.php'),
      ],
    })

    render(<ComparePage />)

    fireEvent.contextMenu(screen.getByText('config').closest('tr')!)
    expect(await screen.findByRole('button', { name: '忽略目录：『config』' })).toBeTruthy()

    fireEvent.contextMenu(screen.getByText('app.php').closest('tr')!)
    expect(await screen.findByRole('button', { name: '忽略文件：『app.php』' })).toBeTruthy()
  })

  it('combines scanning and comparing into one header status and exposes the paired filter', () => {
    resetStores()
    useCompareStore.setState({ scanning: true, comparing: true, done: false })

    render(<ComparePage />)

    expect(screen.getByText('扫描并对比中…')).toBeTruthy()
    expect(screen.queryByText('扫描中…')).toBeNull()
    expect(screen.queryByText('对比中…')).toBeNull()
    expect(screen.getByRole('button', { name: '双方' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '不同' })).toBeTruthy()
  })

  it('does not show the incomplete compare warning banner', () => {
    resetStores()
    useCompareStore.setState({
      entries: [createCompareDirectory('bootstrap', 'pending')],
      scanning: false,
      comparing: false,
      done: false,
    })

    render(<ComparePage />)

    expect(screen.queryByText('当前结果未完成，需先重新对比后才能执行同步。')).toBeNull()
  })

  it('shows compare errors in the compare page UI', () => {
    resetStores()
    useCompareStore.setState({
      error: '左侧目录不可访问：/Volumes/未命名2/迅雷下载/书籍。可能是硬盘未插入、未挂载，或路径已变更。',
      done: false,
      scanning: false,
      comparing: false,
    })

    render(<ComparePage />)

    expect(screen.getByRole('alert').textContent).toContain('左侧目录不可访问：/Volumes/未命名2/迅雷下载/书籍。可能是硬盘未插入、未挂载，或路径已变更。')
  })

  it('shows a source pair summary for sftp compares', () => {
    resetStores()
    useSSHStore.setState({
      configs: [
        { id: 'left-server', label: '生产服', host: 'prod.example.com', port: 22, username: 'deploy', authType: 'privateKey' },
        { id: 'right-server', label: '预发服', host: 'staging.example.com', port: 22, username: 'deploy', authType: 'privateKey' },
      ],
      loading: false,
      loadConfigs: async () => undefined,
    })
    useCompareStore.setState({
      leftSourceType: 'sftp',
      rightSourceType: 'sftp',
      leftSSHConfigId: 'left-server',
      rightSSHConfigId: 'right-server',
      leftPath: '/var/www/api-next',
      rightPath: '/var/www/api',
      leftSource: { type: 'sftp', configId: 'left-server', path: '/var/www/api-next' },
      rightSource: { type: 'sftp', configId: 'right-server', path: '/var/www/api' },
    })

    render(<ComparePage />)

    expect(screen.getByText('生产服:/var/www/api-next ↔ 预发服:/var/www/api')).toBeTruthy()
  })

  it('shows dot files by default instead of hiding them', () => {
    resetStores()
    useCompareStore.setState({
      entries: [createCompareEntry('.env')],
      hideDot: false,
    })

    render(<ComparePage />)

    expect(screen.getAllByText('.env')).toHaveLength(2)
  })

  it('pauses an active compare from the toolbar', async () => {
    const api = installApiMock()
    resetStores([
      {
        id: 'compare-tab-1',
        title: '进行中对比',
        snapshot: createSnapshot({
          entries: [createCompareEntry('src/app.ts')],
          scanning: true,
          comparing: true,
          paused: false,
          done: false,
          activeCompareId: 'compare-1',
        }),
        diffTabs: [],
        activeDiffTabId: null,
      },
    ])
    useCompareStore.setState({
      entries: [createCompareEntry('src/app.ts')],
      scanning: true,
      comparing: true,
      paused: false,
      done: false,
      activeCompareId: 'compare-1',
    })

    const user = userEvent.setup()
    render(<ComparePage />)

    await user.click(screen.getByRole('button', { name: '暂停对比' }))

    await waitFor(() => {
      expect(api.cancelCompare).toHaveBeenCalledWith('compare-1')
    })

    await waitFor(() => {
      const state = useCompareStore.getState()
      expect(state.paused).toBe(true)
      expect(state.scanning).toBe(false)
      expect(state.comparing).toBe(false)
    })

    expect(screen.getByRole('button', { name: '继续对比' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '重启对比' })).toBeTruthy()
  })

  it('continues a paused compare while preserving existing entries', async () => {
    const api = installApiMock({
      runCompare: vi.fn(() => new Promise(() => undefined)),
    })
    resetStores([
      {
        id: 'compare-tab-1',
        title: '已暂停对比',
        snapshot: createSnapshot({
          entries: [createCompareEntry('src/app.ts')],
          scanning: false,
          comparing: false,
          paused: true,
          done: false,
          activeCompareId: null,
        }),
        diffTabs: [],
        activeDiffTabId: null,
      },
    ])
    useCompareStore.setState({
      entries: [createCompareEntry('src/app.ts')],
      scanning: false,
      comparing: false,
      paused: true,
      done: false,
      activeCompareId: null,
    })

    const user = userEvent.setup()
    render(<ComparePage />)

    await user.click(screen.getByRole('button', { name: '继续对比' }))

    await waitFor(() => {
      expect(api.runCompare).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      const state = useCompareStore.getState()
      expect(state.scanning).toBe(true)
      expect(state.paused).toBe(false)
      expect(state.entries.map((entry) => entry.relativePath)).toEqual(['src/app.ts'])
    })
  })

  it('restarts compare from the toolbar and clears previous entries', async () => {
    const api = installApiMock({
      runCompare: vi.fn(() => new Promise(() => undefined)),
    })
    resetStores([
      {
        id: 'compare-tab-1',
        title: '完成对比',
        snapshot: createSnapshot({
          entries: [createCompareEntry('src/app.ts')],
          done: true,
          paused: false,
          activeCompareId: null,
        }),
        diffTabs: [],
        activeDiffTabId: null,
      },
    ])
    useCompareStore.setState({
      entries: [createCompareEntry('src/app.ts')],
      scanning: false,
      comparing: false,
      paused: false,
      done: true,
      activeCompareId: null,
    })

    const user = userEvent.setup()
    render(<ComparePage />)

    await user.click(screen.getByRole('button', { name: '重启对比' }))

    await waitFor(() => {
      expect(api.runCompare).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      const state = useCompareStore.getState()
      expect(state.scanning).toBe(true)
      expect(state.entries).toEqual([])
      expect(state.paused).toBe(false)
    })
  })
})