import { describe, expect, it } from 'vitest'
import { getDirtyRecompareRoots, minimizeSyncRecompareRoots } from './sync-dirty'

describe('minimizeSyncRecompareRoots', () => {
  it('drops roots covered by a shorter ancestor', () => {
    expect(minimizeSyncRecompareRoots(['src', 'src/a', 'docs', 'src/a/b'])).toEqual(['src', 'docs'])
  })

  it('collapses to the compare root when empty path is present', () => {
    expect(minimizeSyncRecompareRoots(['src', '', 'docs'])).toEqual([''])
  })
})

describe('getDirtyRecompareRoots', () => {
  it('uses parent directories of dirty file paths and drops covered roots', () => {
    expect(getDirtyRecompareRoots(new Set(['src/a.ts', 'src/b/c.ts', 'docs/readme.md']))).toEqual([
      'src',
      'docs',
    ])
  })

  it('minimizes nested dirty parents into a single ancestor', () => {
    expect(getDirtyRecompareRoots(['src/a/file.ts', 'src/a/nested/file.ts'])).toEqual(['src/a'])
  })

  it('returns the compare root when a top-level path is dirty', () => {
    expect(getDirtyRecompareRoots(['readme.md', 'src/a.ts'])).toEqual([''])
  })

  it('skips un-normalizable paths', () => {
    expect(getDirtyRecompareRoots(['src/a.ts', '../escape'])).toEqual(['src'])
  })
})
