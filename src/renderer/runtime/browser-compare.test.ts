import { describe, expect, it } from 'vitest'
import { compareBrowserDirectories } from './browser-compare'
import { createMemoryBrowserRoot } from './browser-roots'

describe('compareBrowserDirectories', () => {
  it('compares browser-backed directory trees', async () => {
    const leftRoot = createMemoryBrowserRoot('left', {
      'same.txt': { text: 'shared', mtime: 1_000 },
      'changed.txt': { text: 'abcde', mtime: 1_000 },
      'left-only.txt': { text: 'only-left', mtime: 1_000 },
      'dir/nested.txt': { text: 'nested', mtime: 1_000 },
    })
    const rightRoot = createMemoryBrowserRoot('right', {
      'same.txt': { text: 'shared', mtime: 1_500 },
      'changed.txt': { text: 'vwxyz', mtime: 1_000 },
      'right-only.txt': { text: 'only-right', mtime: 1_000 },
      'dir/nested.txt': { text: 'nested', mtime: 1_500 },
    })

    const result = await compareBrowserDirectories({
      leftRoot,
      rightRoot,
      strategies: ['size', 'hash'],
    })

    expect(result.stats).toEqual({
      total: 6,
      equal: 3,
      different: 1,
      leftOnly: 1,
      rightOnly: 1,
    })

    expect(result.entries.map((entry) => `${entry.relativePath}:${entry.state}`)).toEqual([
      'changed.txt:different',
      'left-only.txt:left_only',
      'right-only.txt:right_only',
      'same.txt:equal',
      'dir:equal',
      'dir/nested.txt:equal',
    ])

    expect(result.entries.find((entry) => entry.relativePath === 'changed.txt')?.reasons).toEqual([
      {
        type: 'hash',
        leftHash: expect.any(String),
        rightHash: expect.any(String),
      },
    ])
  })

  it('supports scoped roots and path filters', async () => {
    const leftRoot = createMemoryBrowserRoot('left', {
      'src/keep.ts': { text: 'export const left = 1\n', mtime: 1_000 },
      'src/node_modules/skip.js': { text: 'ignored\n', mtime: 1_000 },
      'other/outside.ts': { text: 'outside\n', mtime: 1_000 },
    })
    const rightRoot = createMemoryBrowserRoot('right', {
      'src/keep.ts': { text: 'export const right = 2\n', mtime: 1_000 },
      'src/node_modules/skip.js': { text: 'ignored\n', mtime: 1_000 },
      'other/outside.ts': { text: 'outside\n', mtime: 1_000 },
    })

    const result = await compareBrowserDirectories({
      leftRoot,
      rightRoot,
      strategies: ['hash'],
      extensionFilter: ['node_modules'],
      relativeRoots: ['src'],
    })

    expect(result.entries.map((entry) => entry.relativePath)).toEqual(['src/keep.ts'])
    expect(result.stats).toEqual({
      total: 1,
      equal: 0,
      different: 1,
      leftOnly: 0,
      rightOnly: 0,
    })
  })
})