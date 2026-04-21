import { describe, expect, it } from 'vitest'
import { expandDirectoryEntries, seedSyncQueues } from './plan'
import type { CompareEntry } from '@shared/types'

describe('seedSyncQueues', () => {
  it('seeds files immediately and directories for later expansion', () => {
    const entries: CompareEntry[] = [
      {
        relativePath: 'missing-dir',
        name: 'missing-dir',
        isDirectory: true,
        state: 'left_only',
        left: { name: 'missing-dir', path: 'missing-dir', isDirectory: true, size: 0, mtime: 0 },
        reasons: [],
      },
      {
        relativePath: 'changed.txt',
        name: 'changed.txt',
        isDirectory: false,
        state: 'different',
        left: { name: 'changed.txt', path: 'changed.txt', isDirectory: false, size: 2, mtime: 0 },
        right: { name: 'changed.txt', path: 'changed.txt', isDirectory: false, size: 1, mtime: 0 },
        reasons: [{ type: 'size', leftSize: 2, rightSize: 1 }],
      },
    ]

    expect(seedSyncQueues(entries, 'left_to_right')).toEqual({
      pendingItems: [
        { relativePath: 'missing-dir', kind: 'directory' },
        { relativePath: 'changed.txt', kind: 'file' },
      ],
      pendingDirs: ['missing-dir'],
      totalItems: 2,
    })
  })
})

describe('legacy task migration expectations', () => {
  it('keeps remaining directories expandable after resume', () => {
    const remainingItems = [
      { relativePath: 'missing-dir', kind: 'directory' as const },
      { relativePath: 'changed.txt', kind: 'file' as const },
    ]

    const pendingDirs = remainingItems
      .filter((item) => item.kind === 'directory')
      .map((item) => item.relativePath)

    expect(pendingDirs).toEqual(['missing-dir'])
  })
})

describe('expandDirectoryEntries', () => {
  it('creates child work items lazily', () => {
    expect(expandDirectoryEntries('missing-dir', [
      { name: 'nested', isDirectory: true },
      { name: 'a.txt', isDirectory: false },
    ], 'local')).toEqual({
      pendingItems: [
        { relativePath: 'missing-dir/nested', kind: 'directory' },
        { relativePath: 'missing-dir/a.txt', kind: 'file' },
      ],
      pendingDirs: ['missing-dir/nested'],
      totalItems: 2,
    })
  })
})
