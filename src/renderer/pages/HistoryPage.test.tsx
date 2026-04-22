// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import HistoryPage from './HistoryPage'
import { useAppStore } from '../stores/app-store'
import { useCompareStore } from '../stores/compare-store'

function installApiMock() {
  const api = {
    listHistory: vi.fn(async () => ({
      success: true,
      data: [
        {
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
        },
      ],
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
  } as unknown as Window['api']

  window.api = api
  return api
}

describe('HistoryPage labels', () => {
  beforeEach(() => {
    installApiMock()
    useAppStore.setState({
      page: 'history',
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
      extensionFilter: ['node_modules', '.git', 'dist'],
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

  it('renders SSH labels instead of raw config ids in history titles', async () => {
    render(<HistoryPage />)

    await waitFor(() => {
      expect(screen.getByTitle('DogeOW:/var/www/dogeow-api-next ↔ Hermes:/var/www/dogeow-api')).toBeTruthy()
    })

    expect(screen.queryByText(/bc426ff1-797d-458e-b037-9d03a6a5ab12/)).toBeNull()
  })
})