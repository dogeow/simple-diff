// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HistoryDialog from './HistoryDialog'
import { useAppStore } from '../../stores/app-store'
import { useCompareStore } from '../../stores/compare-store'

function createHistoryEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'history-1',
    timestamp: Date.now(),
    leftLabel: 'sftp://bc426ff1-797d-458e-b037-9d03a6a5ab12:/var/www/dogeow-api-next',
    rightLabel: 'sftp://29560000-0000-0000-0000-000000000000:/var/www/dogeow-api',
    leftSource: {
      type: 'sftp',
      configId: 'bc426ff1-797d-458e-b037-9d03a6a5ab12',
      path: '/var/www/dogeow-api-next',
    },
    rightSource: {
      type: 'sftp',
      configId: '29560000-0000-0000-0000-000000000000',
      path: '/var/www/dogeow-api',
    },
    stats: {
      total: 10,
      equal: 7,
      different: 1,
      leftOnly: 1,
      rightOnly: 1,
    },
    ...overrides,
  }
}

function installApiMock(historyData = [createHistoryEntry()]) {
  const api = {
    listHistory: vi.fn(async () => ({
      success: true,
      data: historyData,
    })),
    listSSHConfigs: vi.fn(async () => ({
      success: true,
      data: [
        {
          id: 'bc426ff1-797d-458e-b037-9d03a6a5ab12',
          label: 'DogeOW',
          host: '47.99.220.36',
          port: 22,
          username: 'ecs-user',
          authType: 'privateKey',
        },
        {
          id: '29560000-0000-0000-0000-000000000000',
          label: 'Hermes',
          host: '23.144.116.91',
          port: 22,
          username: 'root',
          authType: 'password',
        },
      ],
    })),
    clearHistory: vi.fn(async () => ({ success: true })),
    deleteHistory: vi.fn(async () => ({ success: true })),
    runCompare: vi.fn(async () => ({ success: true, error: '对比已取消' })),
    cancelCompare: vi.fn(async () => ({ success: true })),
  } as unknown as Window['api']

  window.api = api
  return api
}

/**
 * chunk 8 第 2 条：历史从顶层页面降级成 `Dialog`，列表换成 `DataTable`。
 * 原来的两条断言（SSH 标签而不是裸 configId、按对比组合筛选）逐条保留，
 * 只是宿主从 `role="list"` 换成了 `role="table"`。
 */
describe('HistoryDialog', () => {
  beforeEach(() => {
    installApiMock()
    useAppStore.setState({
      page: 'compare',
      diffTabs: [],
      activeDiffTabId: null,
      compareTabs: [],
      activeCompareTabId: null,
    })
    useCompareStore.setState({
      leftPath: '',
      rightPath: '',
      leftSourceType: 'local',
      rightSourceType: 'local',
      leftSSHConfigId: '',
      rightSSHConfigId: '',
      strategies: ['size', 'mtime'],
      extensionFilter: ['node_modules', '.git', 'dist', '.DS_Store'],
      hideDot: true,
      hideDotFilter: 'all',
      entries: [],
      scanning: false,
      comparing: false,
      done: false,
      error: null,
      duration: 0,
      leftSource: null,
      rightSource: null,
      loadingDirs: new Set(),
      filter: 'all',
      expandedDirs: new Set(),
      viewMode: 'split',
      activeCompareId: null,
      syncTask: null,
      compareVersion: 0,
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders SSH labels instead of raw config ids in history rows', async () => {
    render(<HistoryDialog open onOpenChange={vi.fn()} />)

    const table = await screen.findByRole('table', { name: '对比历史列表' })
    await waitFor(() => {
      expect(
        within(table).getByTitle('DogeOW:/var/www/dogeow-api-next ↔ Hermes:/var/www/dogeow-api'),
      ).toBeTruthy()
    })

    expect(screen.queryByText(/bc426ff1-797d-458e-b037-9d03a6a5ab12/)).toBeNull()
  })

  it('filters history entries by the same host and directory combination', async () => {
    installApiMock([
      createHistoryEntry({ id: 'history-1' }),
      createHistoryEntry({ id: 'history-2', timestamp: Date.now() - 1000 }),
      createHistoryEntry({
        id: 'history-3',
        leftLabel: 'sftp://bc426ff1-797d-458e-b037-9d03a6a5ab12:/srv/api',
        leftSource: {
          type: 'sftp',
          configId: 'bc426ff1-797d-458e-b037-9d03a6a5ab12',
          path: '/srv/api',
        },
      }),
    ])

    const user = userEvent.setup()
    render(<HistoryDialog open onOpenChange={vi.fn()} />)

    const group = await screen.findByRole('group', { name: '对比组合' })
    const chip = await within(group).findByRole('button', {
      name: 'DogeOW:/var/www/dogeow-api-next ↔ Hermes:/var/www/dogeow-api',
    })
    await user.click(chip)

    const table = screen.getByRole('table', { name: '对比历史列表' })
    expect(
      within(table).getAllByTitle('DogeOW:/var/www/dogeow-api-next ↔ Hermes:/var/www/dogeow-api'),
    ).toHaveLength(2)
    expect(within(table).queryByTitle('DogeOW:/srv/api ↔ Hermes:/var/www/dogeow-api')).toBeNull()
  })

  it('重新对比 runs the comparison instead of only prefilling the form', async () => {
    const api = installApiMock()
    const handleOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<HistoryDialog open onOpenChange={handleOpenChange} />)

    await screen.findByRole('table', { name: '对比历史列表' })
    await user.click(
      screen.getByRole('button', {
        name: '重新对比 DogeOW:/var/www/dogeow-api-next ↔ Hermes:/var/www/dogeow-api',
      }),
    )

    await waitFor(() => {
      expect(api.runCompare).toHaveBeenCalled()
    })
    expect(useCompareStore.getState().leftPath).toBe('/var/www/dogeow-api-next')
    expect(handleOpenChange).toHaveBeenCalledWith(false)
  })
})
