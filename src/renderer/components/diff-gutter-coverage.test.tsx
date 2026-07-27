// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { CompareEntry, SourceConfig } from '../../../shared/types'
import { computeTextDiff } from '../../../shared/text-diff'
import CompareTree from './CompareTree'
import SplitTree from './SplitTree'
import FileDiffView from './FileDiffView'
import { useAppStore, type DiffTab } from '../stores/app-store'
import { useCompareStore } from '../stores/compare-store'
import { EMPTY_TREE_SELECTION, useUIStore } from '../stores/ui-store'

/**
 * DESIGN-SYSTEM §1.5 第 1 条 / 蓝图 chunk 10 出厂清单：
 * **每一个差异面（目录树行 + diff 行）都必须画出 `+` / `−` / `~` 字形。**
 *
 * 这不是装饰。实测绿/红在深色主题下的色盲分离度只有 ΔE 5.6，低于 ΔE 6 的下限——
 * 底色对色觉障碍用户是不可分辨的，字形才是唯一的信号。所以这条要钉死，
 * 不能靠“改的时候记得加”。
 */

const LEFT: SourceConfig = { type: 'local', path: '/var/left' }
const RIGHT: SourceConfig = { type: 'local', path: '/var/right' }

function file(name: string, path: string) {
  return { name, path, isDirectory: false, size: 1, mtime: 1 }
}

function entry(relativePath: string, state: CompareEntry['state']): CompareEntry {
  const name = relativePath.split('/').at(-1) ?? relativePath
  return {
    relativePath,
    name,
    isDirectory: false,
    state,
    left: state === 'right_only' ? undefined : file(name, `/var/left/${relativePath}`),
    right: state === 'left_only' ? undefined : file(name, `/var/right/${relativePath}`),
    reasons: [],
  }
}

const ENTRIES: readonly CompareEntry[] = [
  entry('same.ts', 'equal'),
  entry('changed.ts', 'different'),
  entry('only-left.ts', 'left_only'),
  entry('only-right.ts', 'right_only'),
]

function signs(scope: HTMLElement | Document = document): string[] {
  return Array.from(scope.querySelectorAll('[data-diff]')).map((node) => node.getAttribute('data-diff') ?? '')
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
  } as unknown as Window['api']
  useCompareStore.setState({
    leftSource: LEFT,
    rightSource: RIGHT,
    entries: [...ENTRIES],
    scanning: false,
    done: true,
    strategies: ['size'],
    expandedDirs: new Set<string>(),
  })
  useUIStore.setState({ treeSelection: EMPTY_TREE_SELECTION })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DiffGutter 覆盖率（DESIGN-SYSTEM §1.5）', () => {
  it('合并视图的每一行都带差异字形，且状态与字形一一对应', () => {
    render(<CompareTree entries={ENTRIES} filter="all" onDoubleClickFile={() => {}} />)

    // 行按名称排序：changed / only-left / only-right / same。
    // equal → same，different → mod，left_only → del（右边少了它），right_only → add。
    expect(signs()).toEqual(['mod', 'del', 'add', 'same'])
  })

  it('分栏视图两侧各自成行，同一条目在两栏读到的是同一件事', () => {
    render(<SplitTree entries={ENTRIES} filter="all" onDoubleClickFile={() => {}} />)

    const trees = screen.getAllByRole('tree')
    expect(trees).toHaveLength(2)
    // 只在某一侧存在的条目在另一侧是占位空行，所以两栏的字形序列不同长。
    expect(signs(trees[0] as HTMLElement)).toEqual(['mod', 'del', 'same'])
    expect(signs(trees[1] as HTMLElement)).toEqual(['mod', 'add', 'same'])
  })

  it('文件 Diff 的每一行都带 + / − 字形，而不是只有底色', () => {
    const left = 'a\nb\nc\n'
    const right = 'a\nB\nc\nd\n'
    const tab: DiffTab = {
      id: 'changed.ts',
      sessionId: 's1',
      relativePath: 'changed.ts',
      fileName: 'changed.ts',
      hasLeftFile: true,
      hasRightFile: true,
      leftSource: LEFT,
      rightSource: RIGHT,
      leftFullPath: '/var/left/changed.ts',
      rightFullPath: '/var/right/changed.ts',
      leftContent: left,
      rightContent: right,
      originalLeftContent: left,
      originalRightContent: right,
      diffResult: computeTextDiff(left, right),
      loadError: null,
      loading: false,
    }
    useAppStore.setState({ diffTabs: [tab], activeDiffTabId: tab.id })

    render(<FileDiffView tab={tab} />)

    const rendered = signs()
    expect(rendered.length).toBeGreaterThan(0)
    // 左栏出现删除、右栏出现新增；两栏都必须有相同行的空白位。
    expect(rendered).toContain('del')
    expect(rendered).toContain('add')
    expect(rendered).toContain('same')
    // 一个字形都不能漏：每一条渲染出来的 diff 行都有一个装订线格子。
    expect(document.querySelectorAll('[data-diff]').length)
      .toBe(document.querySelectorAll('pre').length)
  })
})

/**
 * 蓝图 §4.4 / F6：保存条不再「改了才出现」。它以前是 diff 上方一条条件挂载的横幅，
 * 于是第一次编辑会把整个面板往下顶一行。现在两个保存按钮常驻差异导航那条工具栏，
 * 干净时 disabled——面板不跳，而且 `⌘S` 有没有可保存的东西一眼可见。
 */
describe('文件 Diff 保存条（§4.4）', () => {
  function diffTab(overrides: Partial<DiffTab> = {}): DiffTab {
    const left = 'a\nb\n'
    const right = 'a\nB\n'
    return {
      id: 'changed.ts',
      sessionId: 's1',
      relativePath: 'changed.ts',
      fileName: 'changed.ts',
      hasLeftFile: true,
      hasRightFile: true,
      leftSource: LEFT,
      rightSource: RIGHT,
      leftFullPath: '/var/left/changed.ts',
      rightFullPath: '/var/right/changed.ts',
      leftContent: left,
      rightContent: right,
      originalLeftContent: left,
      originalRightContent: right,
      diffResult: computeTextDiff(left, right),
      loadError: null,
      loading: false,
      ...overrides,
    }
  }

  it('干净时两个保存按钮在位但不可用，且不显示「已修改」', () => {
    const tab = diffTab()
    useAppStore.setState({ diffTabs: [tab], activeDiffTabId: tab.id })

    render(<FileDiffView tab={tab} />)

    expect(screen.getByRole('button', { name: /保存左侧/ })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: /保存右侧/ })).toHaveProperty('disabled', true)
    expect(screen.queryByText('已修改')).toBeNull()
  })

  it('改了哪一侧就只放开哪一侧，按钮不会凭空出现', () => {
    const tab = diffTab({ leftContent: 'a\nbb\n' })
    useAppStore.setState({ diffTabs: [tab], activeDiffTabId: tab.id })

    render(<FileDiffView tab={tab} />)

    expect(screen.getByRole('button', { name: /保存左侧/ })).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: /保存右侧/ })).toHaveProperty('disabled', true)
    expect(screen.getByText('已修改')).not.toBeNull()
  })
})
