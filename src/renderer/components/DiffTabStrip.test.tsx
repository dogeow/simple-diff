// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DiffTabStrip from './DiffTabStrip'
import { useAppStore, type DiffTab } from '../stores/app-store'
import type { SourceConfig } from '../../../shared/types'

/**
 * 蓝图 §2.2：diff 标签右键菜单是 关闭 / 关闭其他 / 关闭全部 / 复制路径 / 在 Finder 中显示。
 * 后两项以前根本不在菜单里——路径只能从 Diff 视图的路径头上复制，而「在 Finder 中显示」
 * 只有树行有。这里同时钉住它们各自的可用条件。
 */

const LOCAL_LEFT: SourceConfig = { type: 'local', path: '/var/left' }
const LOCAL_RIGHT: SourceConfig = { type: 'local', path: '/var/right' }
const SFTP_RIGHT: SourceConfig = { type: 'sftp', configId: 'ssh-1', path: '/srv/right' }

function diffTab(overrides: Partial<DiffTab> = {}): DiffTab {
  return {
    id: 'tab-1',
    sessionId: 'session-1',
    relativePath: 'src/index.ts',
    fileName: 'index.ts',
    hasLeftFile: true,
    hasRightFile: true,
    leftSource: LOCAL_LEFT,
    rightSource: LOCAL_RIGHT,
    leftFullPath: '/var/left/src/index.ts',
    rightFullPath: '/var/right/src/index.ts',
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

function setRuntimeMode(mode: 'tauri' | 'web'): void {
  window.api = {
    runtime: {
      mode,
      supportsSftp: true,
      supportsHistory: true,
      supportsSync: mode === 'tauri',
      supportsNativeFolderSelection: mode === 'tauri',
      supportsDirectoryDragDrop: mode === 'tauri',
      supportsWriteBack: mode === 'tauri',
    },
    showInFolder: vi.fn(async () => ({ success: true })),
  } as unknown as Window['api']
}

async function openTabMenu(): Promise<void> {
  fireEvent.contextMenu(screen.getByRole('tab', { name: /index\.ts/ }))
  await screen.findByRole('menu')
}

beforeEach(() => {
  setRuntimeMode('tauri')
  useAppStore.setState({ diffTabs: [diffTab()], activeDiffTabId: 'tab-1' })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAppStore.setState({ diffTabs: [], activeDiffTabId: null })
})

describe('DiffTabStrip 右键菜单（蓝图 §2.2）', () => {
  it('关闭三项之外还有复制路径与在 Finder 中显示', async () => {
    // 「关闭其他 / 关闭全部」只在还有别的标签时出现，所以这一条开两个标签。
    useAppStore.setState({
      diffTabs: [diffTab(), diffTab({ id: 'tab-2', relativePath: 'src/util.ts', fileName: 'util.ts' })],
      activeDiffTabId: 'tab-1',
    })
    render(<DiffTabStrip />)
    await openTabMenu()

    // 「关闭」后面紧跟 `Kbd`（⌘W / Ctrl W，随平台而变），所以按前缀匹配。
    expect(screen.getByRole('menuitem', { name: /^关闭(⌘|Ctrl)/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '关闭其他' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '关闭全部' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '复制路径' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '在 Finder 中显示' })).toBeTruthy()
  })

  it('两侧都有文件时复制路径收成 左侧 / 右侧 子菜单', async () => {
    const user = userEvent.setup()
    render(<DiffTabStrip />)
    await openTabMenu()

    await user.click(screen.getByRole('menuitem', { name: '复制路径' }))
    await user.click(await screen.findByRole('menuitem', { name: '右侧' }))

    // `userEvent.setup()` 自带剪贴板桩，直接回读它写进去的东西。
    expect(await navigator.clipboard.readText()).toBe('/var/right/src/index.ts')
  })

  it('只有一侧存在时是平项，直接复制那一侧', async () => {
    useAppStore.setState({
      diffTabs: [diffTab({ hasRightFile: false, rightFullPath: '' })],
      activeDiffTabId: 'tab-1',
    })
    const user = userEvent.setup()
    render(<DiffTabStrip />)
    await openTabMenu()

    await user.click(screen.getByRole('menuitem', { name: '复制路径' }))
    expect(await navigator.clipboard.readText()).toBe('/var/left/src/index.ts')
  })

  it('在 Finder 中显示把相对路径交给那一侧的数据源', async () => {
    useAppStore.setState({
      diffTabs: [diffTab({ hasRightFile: false, rightFullPath: '' })],
      activeDiffTabId: 'tab-1',
    })
    const user = userEvent.setup()
    render(<DiffTabStrip />)
    await openTabMenu()

    await user.click(screen.getByRole('menuitem', { name: '在 Finder 中显示' }))
    expect(window.api.showInFolder).toHaveBeenCalledWith(LOCAL_LEFT, 'src/index.ts')
  })

  it('SFTP 那一侧不进「在 Finder 中显示」——后端只会回一句错', async () => {
    useAppStore.setState({
      diffTabs: [diffTab({ rightSource: SFTP_RIGHT })],
      activeDiffTabId: 'tab-1',
    })
    const user = userEvent.setup()
    render(<DiffTabStrip />)
    await openTabMenu()

    // 复制路径仍然是两侧（远端路径也值得复制），显形只剩本地的左侧，于是收成平项。
    await user.click(screen.getByRole('menuitem', { name: '在 Finder 中显示' }))
    expect(window.api.showInFolder).toHaveBeenCalledWith(LOCAL_LEFT, 'src/index.ts')
  })

  it('浏览器预览态没有「在 Finder 中显示」，复制路径照旧可用', async () => {
    setRuntimeMode('web')
    render(<DiffTabStrip />)
    await openTabMenu()

    expect(screen.queryByRole('menuitem', { name: '在 Finder 中显示' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: '复制路径' })).toBeTruthy()
  })
})
