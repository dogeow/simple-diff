// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TextComparePage from './TextComparePage'
import Statusbar from '../components/Statusbar'
import { useTextDiffStore } from '../stores/text-diff-store'
import { useUIStore } from '../stores/ui-store'
import { computeTextDiff } from '@shared/text-diff'

/**
 * 蓝图 §4.5：这一屏的工具栏是共享 `Toolbar`（标题恒在、`⋯` 收走手动对齐那一组），
 * 手动对齐的提示落在状态栏的任务槽里，而不是工具栏里的一枚行内胶囊。
 */

const LEFT = 'alpha\nbeta\n'
const RIGHT = 'alpha\nBETA\n'

async function openOverflow(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: '更多操作' }))
  await screen.findByRole('menu')
}

/** 自动对比有 120ms 防抖，等它真的跑完一轮。 */
async function settleCompare(): Promise<void> {
  await waitFor(() => expect(useTextDiffStore.getState().result).not.toBeNull(), { timeout: 2000 })
}

function typeBothSides(): void {
  act(() => {
    useTextDiffStore.getState().setLeftText(LEFT, '')
    useTextDiffStore.getState().setRightText(RIGHT, '')
  })
}

beforeEach(() => {
  window.api = {
    textDiff: async (left: string, right: string) => ({ success: true, data: computeTextDiff(left, right) }),
  } as unknown as Window['api']
})

afterEach(() => {
  cleanup()
  useUIStore.setState({ statusHint: null })
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

describe('TextComparePage 工具栏（§4.5）', () => {
  it('标题恒在，高频三件套留在栏上，其余降到 ⋯', async () => {
    const user = userEvent.setup()
    render(<TextComparePage />)

    expect(screen.queryByText('粘贴或拖入文本后自动对比')).toBeNull()
    expect(screen.getByRole('heading', { name: '文本对比' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '交换' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '清空' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: '字符对比' })).toBeTruthy()
    // 旧的行内提示胶囊已经不在工具栏里了。
    expect(screen.queryByText('未启用手动对齐')).toBeNull()

    await openOverflow(user)
    expect(screen.getByRole('menuitem', { name: /^手动对齐/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '清除手动对齐' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '从文件载入…' })).toBeTruthy()
  })

  it('副标题就是那句差异摘要', async () => {
    render(<TextComparePage />)
    typeBothSides()
    await settleCompare()

    expect(screen.getByText('左侧 1 行变化 · 右侧 1 行变化')).toBeTruthy()
  })

  it('没有对比结果时手动对齐不可用，有结果后可用', async () => {
    const user = userEvent.setup()
    render(<TextComparePage />)

    await openOverflow(user)
    expect(screen.getByRole('menuitem', { name: /^手动对齐/ }).getAttribute('aria-disabled')).toBe('true')
    await user.keyboard('{Escape}')

    typeBothSides()
    await settleCompare()

    await openOverflow(user)
    expect(screen.getByRole('menuitem', { name: /^手动对齐/ }).getAttribute('aria-disabled')).not.toBe('true')
  })

  it('⋯ → 从文件载入…：文件内容进那一侧，文件名成为该侧标签', async () => {
    const user = userEvent.setup()
    const { container } = render(<TextComparePage />)

    await openOverflow(user)
    await user.click(screen.getByRole('menuitem', { name: '从文件载入…' }))
    await user.click(await screen.findByRole('menuitem', { name: '右侧' }))

    // 菜单项打开的是这个隐藏 input；jsdom 里没有原生选择框，直接喂它一个 File。
    const input = container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()
    await user.upload(input as HTMLInputElement, new File([RIGHT], 'right.txt', { type: 'text/plain' }))

    await waitFor(() => expect(useTextDiffStore.getState().rightText).toBe(RIGHT))
    expect(useTextDiffStore.getState().rightLabel).toBe('right.txt')
    expect(useTextDiffStore.getState().leftText).toBe('')
  })
})

describe('TextComparePage 手动对齐提示 → 状态栏任务槽（§4.5）', () => {
  it('闲着的时候不占状态栏，进入手动对齐后才说话', async () => {
    const user = userEvent.setup()
    render(<TextComparePage />)
    typeBothSides()
    await settleCompare()

    expect(useUIStore.getState().statusHint).toBeNull()

    await openOverflow(user)
    await user.click(screen.getByRole('menuitem', { name: /^手动对齐/ }))

    const hint = useUIStore.getState().statusHint
    expect(hint?.tone).toBe('warning')
    expect(hint?.label).toContain('已进入手动对齐')
  })

  it('卸载（切回目录对比模式）时把状态栏让回去', async () => {
    const user = userEvent.setup()
    const view = render(<TextComparePage />)
    typeBothSides()
    await settleCompare()

    await openOverflow(user)
    await user.click(screen.getByRole('menuitem', { name: /^手动对齐/ }))
    expect(useUIStore.getState().statusHint).not.toBeNull()

    view.unmount()
    expect(useUIStore.getState().statusHint).toBeNull()
  })

  it('提示真的渲染在状态栏里', () => {
    useUIStore.setState({ statusHint: { tone: 'warning', label: '已进入手动对齐：先点左侧锚点行' } })
    render(<Statusbar />)

    expect(screen.getByText('已进入手动对齐：先点左侧锚点行')).toBeTruthy()
    // 有提示时状态栏不再说「就绪」。
    expect(screen.queryByText('就绪')).toBeNull()
  })
})
