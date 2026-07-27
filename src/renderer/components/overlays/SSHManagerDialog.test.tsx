// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SSHManagerDialog from './SSHManagerDialog'
import { useSSHStore } from '../../stores/ssh-store'

const CONFIG = {
  id: 'prod',
  label: '生产服',
  host: 'prod.example.com',
  port: 22,
  username: 'deploy',
  authType: 'privateKey' as const,
}

/**
 * chunk 8 第 3 条：SSH 管理页降级成 `Dialog`。行为保留，唯一的实质变化是删除现在
 * 走 `ConfirmDialog`（§7.5：破坏性操作永远要有一次确认）。
 */
describe('SSHManagerDialog', () => {
  beforeEach(() => {
    window.api = {
      deleteSSHConfig: vi.fn(async () => ({ success: true })),
      testSSHConnection: vi.fn(async () => ({ success: true, data: true })),
      saveSSHConfig: vi.fn(async () => ({ success: true })),
    } as unknown as Window['api']

    useSSHStore.setState({ configs: [CONFIG], loading: false, loadConfigs: async () => undefined })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    useSSHStore.setState({ configs: [], loading: false })
  })

  it('lists connections with an entry point to create a new one', () => {
    render(<SSHManagerDialog open onOpenChange={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'SSH 连接管理' })).toBeTruthy()
    expect(screen.getByText('deploy@prod.example.com:22')).toBeTruthy()
    expect(screen.getByRole('button', { name: '新建连接' })).toBeTruthy()
  })

  it('routes deletion through a confirm dialog instead of deleting on click', async () => {
    const user = userEvent.setup()
    render(<SSHManagerDialog open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '删除 生产服' }))
    expect(window.api.deleteSSHConfig).not.toHaveBeenCalled()

    const confirm = await screen.findByRole('dialog', { name: '删除这个 SSH 连接？' })
    await user.click(within(confirm).getByRole('button', { name: '删除' }))

    await waitFor(() => {
      expect(window.api.deleteSSHConfig).toHaveBeenCalledWith('prod')
    })
  })
})
