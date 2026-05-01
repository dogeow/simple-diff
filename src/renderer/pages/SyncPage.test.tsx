// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import SyncPage from './SyncPage'
import { useCompareStore } from '../stores/compare-store'
import { useSSHStore } from '../stores/ssh-store'

describe('SyncPage', () => {
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
  })

  it('renders the task pair label and all sync items', () => {
    render(<SyncPage />)

    expect(screen.getByText('生产服:/var/www/api-next ↔ 预发服:/var/www/api')).toBeTruthy()
    expect(screen.getByText('public/cloud/book.txt')).toBeTruthy()
    expect(screen.getByText('任务列表 / 队列')).toBeTruthy()
    expect(screen.getByText('正在执行')).toBeTruthy()
  })
})