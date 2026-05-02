// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadDiffTabContents } from './diff-tab-loader'

const leftSource = { type: 'sftp', configId: 'prod', path: '/srv/left' } as const
const rightSource = { type: 'local', path: '/srv/right' } as const

describe('diff-tab-loader', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('retries transient read failures once before surfacing an error', async () => {
    const readText = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'channel closed' })
      .mockResolvedValueOnce({ success: true, data: 'left content' })
      .mockResolvedValueOnce({ success: true, data: 'right content' })
    const textDiff = vi.fn(async (left: string, right: string) => ({
      success: true,
      data: {
        leftLines: [{ type: 'equal', content: left, lineNumber: 1 }],
        rightLines: [{ type: 'equal', content: right, lineNumber: 1 }],
      },
    }))

    window.api = {
      readText,
      textDiff,
    } as unknown as Window['api']

    const result = await loadDiffTabContents({
      leftSource,
      rightSource,
      leftFullPath: '/srv/left/app.ts',
      rightFullPath: '/srv/right/app.ts',
      readLeft: true,
      readRight: true,
    })

    expect(readText).toHaveBeenCalledTimes(3)
    expect(textDiff).toHaveBeenCalledWith('left content', 'right content')
    expect(result.loadError).toBeNull()
    expect(result.leftContent).toBe('left content')
    expect(result.rightContent).toBe('right content')
  })

  it('does not retry non-transient read failures', async () => {
    const readText = vi.fn(async () => ({ success: false, error: 'permission denied' }))
    const textDiff = vi.fn()

    window.api = {
      readText,
      textDiff,
    } as unknown as Window['api']

    const result = await loadDiffTabContents({
      leftSource: rightSource,
      rightSource: null,
      leftFullPath: '/srv/right/app.ts',
      rightFullPath: '',
      readLeft: true,
      readRight: false,
    })

    expect(readText).toHaveBeenCalledTimes(1)
    expect(textDiff).not.toHaveBeenCalled()
    expect(result.loadError).toContain('没有读取该文件的权限')
  })
})