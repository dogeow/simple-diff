import { describe, expect, it } from 'vitest'
import type { CompareEntry, FileEntry } from '../../../shared/types'
import { summarizeCompareEntries } from './compare-store'

function createFileEntry(name: string, overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    name,
    path: name,
    isDirectory: false,
    size: 1,
    mtime: 1,
    ...overrides,
  }
}

function createCompareEntry(
  relativePath: string,
  overrides: Partial<CompareEntry> = {},
): CompareEntry {
  const name = relativePath.split('/').at(-1) ?? relativePath
  const isDirectory = overrides.isDirectory ?? false
  const baseFile = createFileEntry(name, { path: relativePath, isDirectory })

  return {
    relativePath,
    name,
    isDirectory,
    state: overrides.state ?? 'equal',
    left: overrides.left ?? (overrides.state !== 'right_only' ? baseFile : undefined),
    right: overrides.right ?? (overrides.state !== 'left_only' ? baseFile : undefined),
    reasons: overrides.reasons ?? [],
  }
}

describe('summarizeCompareEntries', () => {
  it('collects stats, pending count, and directory count in one pass', () => {
    const summary = summarizeCompareEntries([
      createCompareEntry('src', { isDirectory: true, state: 'equal' }),
      createCompareEntry('src/pending.txt', { state: 'pending' }),
      createCompareEntry('src/comparing.txt', { state: 'comparing' }),
      createCompareEntry('changed.txt', { state: 'different' }),
      createCompareEntry('left-only.txt', { state: 'left_only', right: undefined }),
      createCompareEntry('right-only.txt', { state: 'right_only', left: undefined }),
      createCompareEntry('equal.txt', { state: 'equal' }),
    ])

    expect(summary).toEqual({
      stats: {
        total: 7,
        equal: 2,
        different: 1,
        leftOnly: 1,
        rightOnly: 1,
      },
      pendingCount: 2,
      allDirCount: 1,
    })
  })
})