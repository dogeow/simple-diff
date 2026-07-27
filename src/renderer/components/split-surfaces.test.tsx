// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CompareEntry, SourceConfig } from '../../../shared/types'
import { computeTextDiff } from '../../../shared/text-diff'
import SplitTree from './SplitTree'
import FileDiffView from './FileDiffView'
import TextComparePage from '../pages/TextComparePage'
import { useAppStore, type DiffTab } from '../stores/app-store'
import { useCompareStore } from '../stores/compare-store'
import { useTextDiffStore } from '../stores/text-diff-store'
import { EMPTY_TREE_SELECTION, useUIStore } from '../stores/ui-store'

/**
 * 设计蓝图 §4.3 / §4.4 / §4.5：这三个并排面都是「可调宽」的，而且分隔条必须是
 * 真控件——`role="separator"`、进 Tab 序、方向键能调、双击复位、比例记得住。
 *
 * 同样重要的是**换容器不能换掉别的东西**：两栏共用一个虚拟窗口、滚动互相同步、
 * `ScrollGutter` 的高度等于它观察的那个滚动区（否则 §4.4 的差异标记会整体错位）。
 * 所以下面既钉分隔条，也钉这几条不变式。
 */

const LEFT: SourceConfig = { type: 'local', path: '/var/left' }
const RIGHT: SourceConfig = { type: 'local', path: '/var/right' }

function entry(relativePath: string, state: CompareEntry['state']): CompareEntry {
  const name = relativePath.split('/').at(-1) ?? relativePath
  const file = { name, path: `/var/x/${relativePath}`, isDirectory: false, size: 1, mtime: 1 }
  return {
    relativePath,
    name,
    isDirectory: false,
    state,
    left: state === 'right_only' ? undefined : file,
    right: state === 'left_only' ? undefined : file,
    reasons: [],
  }
}

const ENTRIES: readonly CompareEntry[] = [entry('changed.ts', 'different'), entry('same.ts', 'equal')]

function diffTab(): DiffTab {
  const left = 'a\nb\nc\n'
  const right = 'a\nB\nc\nd\n'
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
  }
}

/** 分隔条左右两侧那两个「栏」——`SplitPane` 把它们放在分隔条的前后。 */
function panes(separator: HTMLElement): readonly [HTMLElement, HTMLElement] {
  const first = separator.previousElementSibling as HTMLElement | null
  const second = separator.nextElementSibling as HTMLElement | null
  if (!first || !second) throw new Error('SplitPane 应当在分隔条两侧各留一栏')
  return [first, second]
}

beforeEach(() => {
  localStorage.clear()
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
    leftPath: '/var/left',
    rightPath: '/var/right',
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
  localStorage.clear()
  useAppStore.setState({ diffTabs: [], activeDiffTabId: null })
  useTextDiffStore.setState({
    leftText: '',
    rightText: '',
    leftLabel: '',
    rightLabel: '',
    result: null,
    computing: false,
    error: null,
    charLevel: false,
  })
})

describe('分栏目录树（§4.3）', () => {
  it('两栏之间是一条可聚焦、可用方向键调宽的分隔条', async () => {
    const user = userEvent.setup()
    render(<SplitTree entries={ENTRIES} filter="all" onDoubleClickFile={() => {}} />)

    const separator = screen.getByRole('separator', { name: '调整左右目录栏宽度' })
    expect(separator.getAttribute('aria-orientation')).toBe('vertical')
    expect(separator.getAttribute('aria-valuenow')).toBe('50')

    const [first] = panes(separator)
    separator.focus()
    expect(document.activeElement).toBe(separator)

    await user.keyboard('{ArrowRight}')
    expect(Number(separator.getAttribute('aria-valuenow'))).toBeGreaterThan(50)
    // 比例真的作用在第一栏的 flex 基准上，而不是只改了个 ARIA 数字。
    expect(first.style.flex).not.toBe('0 0 50%')

    await user.dblClick(separator)
    expect(separator.getAttribute('aria-valuenow')).toBe('50')
    expect(localStorage.getItem('ds-split:compare-split')).toBe('0.5')
  })

  it('路径表头跟着分隔条走：每一栏装着自己的路径框和自己的树', () => {
    render(<SplitTree entries={ENTRIES} filter="all" onDoubleClickFile={() => {}} />)

    const [first, second] = panes(screen.getByRole('separator'))
    const trees = screen.getAllByRole('tree')
    expect(trees).toHaveLength(2)

    expect(first.contains(screen.getByLabelText('左侧路径'))).toBe(true)
    expect(first.contains(trees[0])).toBe(true)
    expect(first.contains(trees[1])).toBe(false)

    expect(second.contains(screen.getByLabelText('右侧路径'))).toBe(true)
    expect(second.contains(trees[1])).toBe(true)
  })

  it('滚动装订线仍旧只覆盖左栏的滚动区', () => {
    render(<SplitTree entries={ENTRIES} filter="all" onDoubleClickFile={() => {}} />)

    const gutter = document.querySelector('[data-scroll-gutter]')
    expect(gutter).not.toBeNull()

    const row = gutter?.parentElement as HTMLElement
    const trees = screen.getAllByRole('tree')
    // 装订线和左栏滚动区是同一行的两个孩子——右栏不在里面，所以它量到的高度
    // 就是左栏内容区的高度。
    expect(row.contains(trees[0])).toBe(true)
    expect(row.contains(trees[1])).toBe(false)
    expect(row.children).toHaveLength(2)
  })

  it('空态时分隔条仍在（表头依旧可调），空态本身跨两栏只画一次', () => {
    render(<SplitTree entries={[]} filter="all" onDoubleClickFile={() => {}} emptyStateMessage="无匹配项" />)

    expect(screen.getByRole('separator', { name: '调整左右目录栏宽度' })).toBeTruthy()
    expect(screen.queryAllByRole('tree')).toHaveLength(0)
    expect(screen.getAllByText('无匹配项')).toHaveLength(1)
  })
})

describe('文件差异视图（§4.4）', () => {
  it('两栏可调宽，且每一栏装着自己的路径头', async () => {
    const user = userEvent.setup()
    const tab = diffTab()
    useAppStore.setState({ diffTabs: [tab], activeDiffTabId: tab.id })

    render(<FileDiffView tab={tab} />)

    const separator = screen.getByRole('separator', { name: '调整左右差异栏宽度' })
    const [first, second] = panes(separator)
    expect(first.textContent).toContain('/var/left/changed.ts')
    expect(second.textContent).toContain('/var/right/changed.ts')

    separator.focus()
    await user.keyboard('{ArrowLeft}')
    expect(Number(separator.getAttribute('aria-valuenow'))).toBeLessThan(50)
    // 每个面各记各的比例，互不覆盖。
    expect(localStorage.getItem('ds-split:file-diff-split')).not.toBeNull()
    expect(localStorage.getItem('ds-split:compare-split')).toBeNull()
  })

  it('差异标记所在的装订线仍旧只覆盖左栏的差异内容区', () => {
    const tab = diffTab()
    useAppStore.setState({ diffTabs: [tab], activeDiffTabId: tab.id })

    render(<FileDiffView tab={tab} />)

    const gutter = document.querySelector('[data-scroll-gutter]') as HTMLElement
    const [first, second] = panes(screen.getByRole('separator'))
    expect(first.contains(gutter)).toBe(true)
    expect(second.contains(gutter)).toBe(false)
    // 装订线和左栏滚动区并排；路径头不在同一行里，所以不会把标记坐标撑歪。
    const row = gutter.parentElement as HTMLElement
    expect(row.children).toHaveLength(2)
    expect(row.textContent).not.toContain('/var/left/changed.ts')
  })
})

describe('文本对比（§4.5）', () => {
  it('两块输入面板由分隔条隔开并且可调宽', async () => {
    const user = userEvent.setup()
    render(<TextComparePage />)

    const separator = screen.getByRole('separator', { name: '调整左右文本栏宽度' })
    const [first, second] = panes(separator)
    expect(first.textContent).toContain('左侧')
    expect(second.textContent).toContain('右侧')

    separator.focus()
    await user.keyboard('{End}')
    expect(separator.getAttribute('aria-valuenow')).toBe('90')
    expect(localStorage.getItem('ds-split:text-split')).toBe('0.9')
  })
})
