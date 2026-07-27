// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FilterPopover from './FilterPopover'

afterEach(() => cleanup())

describe('FilterPopover', () => {
  it('shows exact-path rules without their storage prefix and merges them back on apply', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<FilterPopover extensionFilter={['path:bootstrap', 'node_modules']} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: '过滤 (2)' }))

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('bootstrap\nnode_modules')

    await user.clear(textarea)
    await user.type(textarea, 'bootstrap{enter}dist')
    await user.click(screen.getByRole('button', { name: '应用' }))

    // `path:` 前缀在往返中保留，右键『忽略』写入的精确规则不会退化成同名 glob。
    expect(onChange).toHaveBeenCalledWith(['path:bootstrap', 'dist'])
  })

  it('clears every rule and closes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<FilterPopover extensionFilter={['node_modules']} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: '过滤 (1)' }))
    await user.click(screen.getByRole('button', { name: '清除' }))

    expect(onChange).toHaveBeenCalledWith([])
    expect(screen.queryByRole('dialog', { name: '路径过滤规则' })).toBeNull()
  })

  it('drops the un-applied draft when reopened', async () => {
    const user = userEvent.setup()
    render(<FilterPopover extensionFilter={['node_modules']} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '过滤 (1)' }))
    await user.type(screen.getByRole('textbox'), '\nscratch')
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: '过滤 (1)' }))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('node_modules')
  })

  it('lets the setup panel spell the action out instead of reusing the chip label', () => {
    render(<FilterPopover extensionFilter={[]} onChange={vi.fn()} label="编辑过滤…" />)
    expect(screen.getByRole('button', { name: '编辑过滤…' })).toBeTruthy()
  })
})
