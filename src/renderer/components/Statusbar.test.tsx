// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Statusbar from './Statusbar'
import { useCompareStore } from '../stores/compare-store'
import { useLogStore } from '../stores/log-store'
import { EMPTY_TREE_SELECTION, useUIStore } from '../stores/ui-store'
import type { LogEntry, SourceConfig, SyncTaskSnapshot } from '../../../shared/types'

const LEFT_SOURCE: SourceConfig = { type: 'local', path: '/left' }
const RIGHT_SOURCE: SourceConfig = { type: 'local', path: '/right' }

function createSyncTask(overrides: Partial<SyncTaskSnapshot> = {}): SyncTaskSnapshot {
  return {
    id: 'sync-1',
    leftSource: LEFT_SOURCE,
    rightSource: RIGHT_SOURCE,
    direction: 'left_to_right',
    status: 'running',
    totalItems: 120,
    completedItems: 41,
    currentPath: 'src/util.ts',
    lastCompletedPath: null,
    lastError: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function createLogEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return { timestamp: 1, scope: 'app', level: 'info', message: 'hello', ...overrides }
}

beforeEach(() => {
  window.api = {
    runtime: {
      mode: 'tauri',
      supportsSftp: true,
      supportsHistory: true,
      supportsSync: true,
      supportsNativeFolderSelection: true,
      supportsDirectoryDragDrop: true,
      supportsWriteBack: true,
    },
    pauseSync: vi.fn(async () => ({ success: true })),
    resumeSync: vi.fn(async () => ({ success: true })),
    clearSync: vi.fn(async () => ({ success: true })),
  } as unknown as Window['api']

  useCompareStore.setState({
    scanning: false,
    comparing: false,
    paused: false,
    done: false,
    duration: 0,
    entries: [],
    syncTask: null,
    leftSource: LEFT_SOURCE,
    rightSource: RIGHT_SOURCE,
  })
  useLogStore.setState({ logs: [], visible: false })
  useUIStore.setState({ overlay: null, treeSelection: EMPTY_TREE_SELECTION, statusHint: null })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Statusbar 任务槽位', () => {
  it('空闲时显示“就绪”，没有任何任务噪音', () => {
    render(<Statusbar />)
    expect(screen.getByText('就绪')).toBeTruthy()
  })

  it('扫描与对比并行时合成一个标签', () => {
    useCompareStore.setState({ scanning: true, comparing: true })
    render(<Statusbar />)
    expect(screen.getByText('扫描并对比中')).toBeTruthy()
  })

  it('对比暂停优先于同步任务显示', () => {
    useCompareStore.setState({ paused: true, syncTask: createSyncTask() })
    render(<Statusbar />)
    expect(screen.getByText('对比已暂停')).toBeTruthy()
  })

  it('同步进行中展示进度，点击后弹出任务列表', async () => {
    useCompareStore.setState({ syncTask: createSyncTask() })
    const user = userEvent.setup()
    render(<Statusbar />)

    expect(screen.getByText('同步中')).toBeTruthy()
    await user.click(screen.getByText('同步中'))

    expect(await screen.findByText('同步 41/120')).toBeTruthy()
    expect(screen.getByRole('button', { name: '暂停' })).toBeTruthy()
  })

  it('任务列表的“查看全部”打开同步叠加层', async () => {
    useCompareStore.setState({ syncTask: createSyncTask() })
    const user = userEvent.setup()
    render(<Statusbar />)

    await user.click(screen.getByText('同步中'))
    await user.click(await screen.findByRole('button', { name: '查看全部' }))

    expect(useUIStore.getState().overlay).toBe('sync')
  })
})

describe('Statusbar 视图提示（蓝图 §4.5）', () => {
  it('提示占任务槽，warning 色', () => {
    useUIStore.setState({ statusHint: { tone: 'warning', label: '请选择有实际内容的行' } })
    render(<Statusbar />)

    expect(screen.getByText('请选择有实际内容的行')).toBeTruthy()
    expect(screen.queryByText('就绪')).toBeNull()
  })

  it('后台还跑着作业时两句话并存——正在跑的活不会被一句引导语盖掉', () => {
    useCompareStore.setState({ scanning: true })
    useUIStore.setState({ statusHint: { tone: 'idle', label: '已启用 2 组手动对齐' } })
    render(<Statusbar />)

    expect(screen.getByText('扫描中')).toBeTruthy()
    expect(screen.getByText('已启用 2 组手动对齐')).toBeTruthy()
  })
})

describe('Statusbar 选择槽位', () => {
  it('没有选择时不占位', () => {
    render(<Statusbar />)
    expect(screen.queryByText(/已选/)).toBeNull()
  })

  it('有选择时显示计数并可清除', async () => {
    useUIStore.setState({ treeSelection: { selectedPaths: new Set(['a', 'b']), anchorPath: 'b' } })
    const user = userEvent.setup()
    render(<Statusbar />)

    expect(screen.getByText('已选 2 项')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '清除选择' }))

    expect(useUIStore.getState().treeSelection.selectedPaths.size).toBe(0)
  })
})

describe('Statusbar 日志槽位', () => {
  it('计数为错误时用 danger 色，点击切换日志面板', async () => {
    useLogStore.setState({ logs: [createLogEntry({ level: 'error', message: 'boom' })] })
    const user = userEvent.setup()
    render(<Statusbar />)

    const chip = screen.getByRole('button', { name: /日志/ })
    expect(chip.textContent).toContain('1')

    await user.click(chip)
    expect(useLogStore.getState().visible).toBe(true)
  })
})
