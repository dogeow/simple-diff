// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CompareEntry, SourceConfig } from '../../../shared/types'
import CompareTree from './CompareTree'
import SplitTree from './SplitTree'
import { useCompareStore } from '../stores/compare-store'
import { EMPTY_TREE_SELECTION, useUIStore } from '../stores/ui-store'

/**
 * chunk 7 的第二半（工具组件早就在盘上，但没人挂）：目录树建在共享 `TreeRow` 上。
 * 这里钉的是 chunk 10 出厂清单里靠它兑现的两条——
 * 「§5 的目录树绑定都要真的生效」和「删除不许走 `window.confirm`」。
 */

const LEFT: SourceConfig = { type: 'local', path: '/var/left' }
const RIGHT: SourceConfig = { type: 'local', path: '/var/right' }

function fileEntry(name: string, path: string) {
  return { name, path, isDirectory: false, size: 1, mtime: 1 }
}

function dir(relativePath: string): CompareEntry {
  const name = relativePath.split('/').at(-1) ?? relativePath
  return {
    relativePath,
    name,
    isDirectory: true,
    state: 'different',
    left: { ...fileEntry(name, `/var/left/${relativePath}`), isDirectory: true, size: 0 },
    right: { ...fileEntry(name, `/var/right/${relativePath}`), isDirectory: true, size: 0 },
    reasons: [],
  }
}

function file(relativePath: string): CompareEntry {
  const name = relativePath.split('/').at(-1) ?? relativePath
  return {
    relativePath,
    name,
    isDirectory: false,
    state: 'different',
    left: fileEntry(name, `/var/left/${relativePath}`),
    right: fileEntry(name, `/var/right/${relativePath}`),
    reasons: [],
  }
}

const ENTRIES: readonly CompareEntry[] = [dir('src'), file('src/a.ts'), file('src/b.ts'), file('readme.md')]

function rows(): HTMLElement[] {
  return screen.getAllByRole('treeitem')
}

beforeEach(() => {
  window.api = {
    runtime: {
      mode: 'tauri',
      supportsSftp: false,
      supportsHistory: false,
      supportsSync: false,
      supportsNativeFolderSelection: true,
      supportsDirectoryDragDrop: true,
      supportsWriteBack: true,
    },
    deleteFile: vi.fn(async () => ({ success: true })),
  } as unknown as Window['api']
  useCompareStore.setState({
    leftSource: LEFT,
    rightSource: RIGHT,
    entries: [...ENTRIES],
    expandedDirs: new Set(['src']),
    extensionFilter: [],
    scanning: false,
    done: true,
    strategies: ['size'],
  })
  useUIStore.setState({ treeSelection: EMPTY_TREE_SELECTION })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CompareTree — 树语义与键盘导航（蓝图 §5）', () => {
  it('每一行都是 treeitem，并带层级与位置信息', () => {
    render(<CompareTree entries={ENTRIES} filter="all" onDoubleClickFile={() => {}} />)

    const [first, second] = rows()
    expect(screen.getByRole('tree', { name: '对比结果' })).toBeTruthy()
    expect(first.getAttribute('aria-level')).toBe('1')
    expect(first.getAttribute('aria-expanded')).toBe('true')
    expect(second.getAttribute('aria-level')).toBe('2')
    expect(first.getAttribute('aria-setsize')).toBe(String(rows().length))
  })

  it('roving tabIndex：只有一个 Tab 停靠点，方向键把它挪走', () => {
    render(<CompareTree entries={ENTRIES} filter="all" onDoubleClickFile={() => {}} />)

    expect(rows().filter((row) => row.tabIndex === 0)).toHaveLength(1)
    expect(rows()[0].tabIndex).toBe(0)

    // 第一次 ArrowDown 把焦点“落进”树里（停在第 0 行），之后才逐行走。
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowDown' })

    expect(rows()[2].tabIndex).toBe(0)
    expect(rows().filter((row) => row.tabIndex === 0)).toHaveLength(1)

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'End' })
    expect(rows().at(-1)?.tabIndex).toBe(0)

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'Home' })
    expect(rows()[0].tabIndex).toBe(0)
  })

  it('← 折叠已展开的目录，→ 再展开它', () => {
    render(<CompareTree entries={ENTRIES} filter="all" onDoubleClickFile={() => {}} />)

    fireEvent.keyDown(rows()[0], { key: 'ArrowLeft' })
    expect(useCompareStore.getState().expandedDirs.has('src')).toBe(false)

    fireEvent.keyDown(rows()[0], { key: 'ArrowRight' })
    expect(useCompareStore.getState().expandedDirs.has('src')).toBe(true)
  })

  it('Enter 打开聚焦的文件', () => {
    const onOpen = vi.fn()
    render(<CompareTree entries={ENTRIES} filter="all" onDoubleClickFile={onOpen} />)

    fireEvent.keyDown(rows()[1], { key: 'Enter' })

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ relativePath: 'src/a.ts' }))
  })

  it('每一行都有常驻的 ⋯，悬停不是唯一入口（§5）', () => {
    render(<CompareTree entries={ENTRIES} filter="all" onDoubleClickFile={() => {}} />)

    expect(screen.getAllByRole('button', { name: '行操作' }).length).toBe(rows().length)
  })

  it('删除走 ConfirmDialog 而不是 window.confirm（§7.5）', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const user = userEvent.setup()
    render(<CompareTree entries={ENTRIES} filter="all" onDoubleClickFile={() => {}} />)

    fireEvent.contextMenu(rows()[1])
    // 合并视图里两侧都是本地目录，所以「删除」收成 左侧 / 右侧 子菜单。
    await user.click(await screen.findByRole('menuitem', { name: '删除' }))
    await user.click(await screen.findByRole('menuitem', { name: '左侧' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('src/a.ts')
    expect(dialog.textContent).toContain('不可撤销')
    expect(confirmSpy).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(window.api.deleteFile).toHaveBeenCalledWith(LEFT, 'src/a.ts', false))
  })
})

describe('SplitTree — 两侧共用同一份行动作（chunk 7 第 5 条）', () => {
  it('左右两栏各自是一棵树，行动作同款', async () => {
    const user = userEvent.setup()
    render(<SplitTree entries={ENTRIES} filter="all" onDoubleClickFile={() => {}} />)

    const [leftTree, rightTree] = screen.getAllByRole('tree')
    expect(leftTree.getAttribute('aria-label')).toBe('左侧目录')
    expect(rightTree.getAttribute('aria-label')).toBe('右侧目录')

    const leftRow = leftTree.querySelectorAll('[role="treeitem"]')[1] as HTMLElement
    fireEvent.contextMenu(leftRow)
    // 以前分栏视图给五项、合并视图给两项；现在两边拿到的是同一个构造器。
    expect(await screen.findByRole('menuitem', { name: '打开差异' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '在 Finder 中显示' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '重命名' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '忽略文件：『a.ts』' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '删除' })).toBeTruthy()

    await user.keyboard('{Escape}')
  })
})

describe('CompareTree — 双击 / Enter 的统一含义（蓝图 §1.4）', () => {
  it('双击目录展开或折叠它（以前双击目录什么也不会发生）', () => {
    render(<CompareTree entries={ENTRIES} filter="all" onDoubleClickFile={() => {}} />)

    fireEvent.doubleClick(rows()[0])
    expect(useCompareStore.getState().expandedDirs.has('src')).toBe(false)

    fireEvent.doubleClick(rows()[0])
    expect(useCompareStore.getState().expandedDirs.has('src')).toBe(true)
  })

  it('双击文件打开它的 Diff', () => {
    const onOpen = vi.fn()
    render(<CompareTree entries={ENTRIES} filter="all" onDoubleClickFile={onOpen} />)

    fireEvent.doubleClick(rows()[1])

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ relativePath: 'src/a.ts' }))
  })
})
