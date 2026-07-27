// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsDialog from './SettingsDialog'
import { DEFAULT_COMPARE_DEFAULTS, useSettingsStore } from '../../stores/settings-store'
import { useCompareStore } from '../../stores/compare-store'

/**
 * chunk 8 第 1 条：设置页降级成叠加层，同时补上蓝图 §4.6 里那三块新内容
 * （默认比较依据 / 默认视图 / 色盲友好差异色 / 隐藏点文件默认值）。
 * 全局过滤那一块的行为要求与 `pages/SettingsPage.tsx` 逐字一致。
 */
describe('SettingsDialog', () => {
  beforeEach(() => {
    window.api = {
      cancelCompare: vi.fn(async () => ({ success: true })),
      runCompare: vi.fn(async () => ({ success: true, error: '对比已取消' })),
    } as unknown as Window['api']

    useSettingsStore.setState({
      globalPathFilters: [],
      theme: 'system',
      compareDefaults: DEFAULT_COMPARE_DEFAULTS,
      colorblindDiff: false,
    })
    useCompareStore.setState({ scanning: false, comparing: false })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders the four blueprint sections and starts on 外观', async () => {
    render(<SettingsDialog open onOpenChange={vi.fn()} />)

    const tablist = screen.getByRole('tablist', { name: '设置分区' })
    expect([...tablist.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual([
      '外观',
      '对比',
      '过滤',
      '关于',
    ])
    expect(screen.getByRole('radiogroup', { name: '应用主题' })).toBeTruthy()
  })

  it('writes the compare defaults instead of touching the live session', async () => {
    const user = userEvent.setup()
    render(<SettingsDialog open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: '对比' }))
    await user.click(screen.getByRole('radio', { name: '合并' }))

    expect(useSettingsStore.getState().compareDefaults.viewMode).toBe('merged')
    // 默认值只在全新工作区启动时灌入（utils/compare-defaults.ts），不动当前会话。
    expect(useCompareStore.getState().viewMode).toBe('split')
  })

  it('toggles the colorblind diff preference', async () => {
    const user = userEvent.setup()
    render(<SettingsDialog open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: '对比' }))
    await user.click(screen.getByRole('switch', { name: '色盲友好差异色' }))

    expect(useSettingsStore.getState().colorblindDiff).toBe(true)
  })

  it('saves global path filters through the same merge rules as the old page', async () => {
    const user = userEvent.setup()
    render(<SettingsDialog open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: '过滤' }))
    const editor = screen.getByLabelText('全局过滤规则')
    await user.type(editor, ' node_modules \nNODE_MODULES\n.git')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(useSettingsStore.getState().globalPathFilters).toEqual(['node_modules', '.git'])
    })
  })
})
