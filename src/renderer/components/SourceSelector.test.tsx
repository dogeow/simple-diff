// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SourceSelector from './SourceSelector'
import { useSSHStore } from '../stores/ssh-store'

function installApiMock() {
  const api = {
    listSSHConfigs: vi.fn(async () => ({
      success: true,
      data: [
        {
          id: 'dogeow',
          label: 'DogeOW',
          host: '47.99.220.36',
          port: 22,
          username: 'ecs-user',
          authType: 'privateKey',
          defaultPath: '/var/www',
        },
      ],
    })),
    browseSSH: vi.fn(async (configId: string, dirPath: string) => {
      if (configId !== 'dogeow') {
        return { success: false, error: 'SSH 配置未找到' }
      }

      if (dirPath === '/') {
        return {
          success: true,
          data: [
            { name: 'var', path: 'var', isDirectory: true, size: 0, mtime: 1 },
            { name: 'tmp', path: 'tmp', isDirectory: true, size: 0, mtime: 1 },
          ],
        }
      }

      if (dirPath === '/var') {
        return {
          success: true,
          data: [
            { name: 'www', path: 'www', isDirectory: true, size: 0, mtime: 1 },
          ],
        }
      }

      return { success: true, data: [] }
    }),
    selectFolder: vi.fn(async () => ({ success: true, data: '/tmp' })),
    getPathForFile: vi.fn(() => '/tmp'),
  } as unknown as Window['api']

  window.api = api
  return api
}

describe('SourceSelector sftp browsing', () => {
  beforeEach(() => {
    installApiMock()
    useSSHStore.setState({ configs: [], loading: false })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    useSSHStore.setState({ configs: [], loading: false })
  })

  it('lets users browse remote directories and select the current directory', async () => {
    const user = userEvent.setup()
    const handlePathChange = vi.fn()

    render(
      <SourceSelector
        label="左侧"
        sourceType="sftp"
        path="/"
        sshConfigId="dogeow"
        onSourceTypeChange={vi.fn()}
        onPathChange={handlePathChange}
        onSSHConfigIdChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(window.api.listSSHConfigs).toHaveBeenCalledTimes(1)
    })

    await user.click(screen.getByRole('button', { name: '浏览...' }))

    // chunk 8：手写模态框换成共享 `Dialog`，可访问名字来自它的标题。
    expect(await screen.findByRole('dialog', { name: '浏览远程目录' })).toBeTruthy()

    await waitFor(() => {
      expect(window.api.browseSSH).toHaveBeenCalledWith('dogeow', '/')
    })

    await user.click(await screen.findByRole('button', { name: 'var/进入' }))

    await waitFor(() => {
      expect(window.api.browseSSH).toHaveBeenLastCalledWith('dogeow', '/var')
    })

    await user.click(screen.getByRole('button', { name: '选择当前目录' }))

    expect(handlePathChange).toHaveBeenLastCalledWith('/var')
  })
})