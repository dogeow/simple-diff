// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import SyncDrawer from './SyncDrawer'
import { useCompareStore } from '../../stores/compare-store'
import { useSSHStore } from '../../stores/ssh-store'

/**
 * chunk 8 第 4 条：`pages/SyncPage.tsx` 变成右侧抽屉。原来的断言（数据源标签、
 * 队列项、三组分组）逐条保留，只是「任务列表 / 队列」这个页面标题换成了抽屉自己的
 * 「同步队列」。
 */
describe('SyncDrawer', () => {
  beforeEach(() => {
    window.api = {
      pauseSync: vi.fn(async () => ({ success: true, data: null })),
      resumeSync: vi.fn(async () => ({ success: true, data: null })),
      clearSync: vi.fn(async () => ({ success: true })),
    } as unknown as Window['api']

    useSSHStore.setState({
      configs: [
        { id: 'prod', label: '生产服', host: 'prod.example.com', port: 22, username: 'deploy', authType: 'privateKey' },
        { id: 'staging', label: '预发服', host: 'staging.example.com', port: 22, username: 'deploy', authType: 'privateKey' },
      ],
      loading: false,
      loadConfigs: async () => undefined,
    })

    useCompareStore.setState({
      syncTask: {
        id: 'sync-1',
        leftSource: { type: 'sftp', configId: 'prod', path: '/var/www/api-next' },
        rightSource: { type: 'sftp', configId: 'staging', path: '/var/www/api' },
        direction: 'left_to_right',
        status: 'running',
        totalItems: 3,
        completedItems: 1,
        currentPath: 'public/cloud/book.txt',
        lastCompletedPath: 'public',
        lastError: null,
        createdAt: 1,
        updatedAt: 2,
        items: [
          { relativePath: 'public', kind: 'directory', status: 'completed' },
          { relativePath: 'public/cloud', kind: 'directory', status: 'completed' },
          { relativePath: 'public/cloud/book.txt', kind: 'file', status: 'running' },
        ],
      },
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    useCompareStore.setState({ syncTask: null })
  })

  it('renders the task pair label and all sync items', () => {
    render(<SyncDrawer open onOpenChange={vi.fn()} />)

    const drawer = screen.getByRole('dialog', { name: '同步队列' })
    expect(drawer.textContent).toContain('生产服:/var/www/api-next ↔ 预发服:/var/www/api')
    expect(screen.getByTitle('public/cloud/book.txt')).toBeTruthy()
    // 三组队列标题（「已完成」同时也是条目状态徽章的文案，所以用 getAll）。
    expect(screen.getAllByText('正在执行').length).toBeGreaterThan(0)
    expect(screen.getByText('等待队列')).toBeTruthy()
    expect(screen.getAllByText('已完成').length).toBeGreaterThan(0)
  })

  it('offers an empty state with a way out when there is no task', () => {
    useCompareStore.setState({ syncTask: null })
    render(<SyncDrawer open onOpenChange={vi.fn()} />)

    expect(screen.getByText('暂无同步任务')).toBeTruthy()
    expect(screen.getByRole('button', { name: /回到目录对比/ })).toBeTruthy()
  })
})
