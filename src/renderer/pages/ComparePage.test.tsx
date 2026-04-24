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
    hideDot: true,
    hideDotFilter: 'all',
    entries: [createCompareEntry('src/app.ts')],
    scanning: false,
    comparing: false,
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
}

function installApiMock() {
  const api = {
    onLog: vi.fn(() => () => undefined),
    cancelCompare: vi.fn(async () => ({ success: true })),
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

    expect(screen.getByRole('button', { name: '重新对比' })).toBeTruthy()

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
    expect(screen.getByText('不同 1')).toBeTruthy()
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
})