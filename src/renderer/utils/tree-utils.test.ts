import { describe, expect, it } from 'vitest'
import type { CompareEntry, CompareState } from '../../../shared/types'
import { buildTree, buildVisibleNodes, getVisibleNodes, prepareCompareEntries } from './tree-utils'

function createEntry(
  relativePath: string,
  state: CompareState,
  options: Partial<CompareEntry> = {},
): CompareEntry {
  const name = relativePath.split('/').at(-1) ?? relativePath
  const isDirectory = options.isDirectory ?? false
  const file = {
    name,
    path: relativePath,
    isDirectory,
    size: 1,
    mtime: 1,
  }

  return {
    relativePath,
    name,
    isDirectory,
    state,
    left: options.left ?? (state !== 'right_only' ? file : undefined),
    right: options.right ?? (state !== 'left_only' ? file : undefined),
    reasons: options.reasons ?? [],
  }
}

describe('prepareCompareEntries', () => {
  it('filters entries by side before further processing', () => {
    const entries = [
      createEntry('same.txt', 'equal'),
      createEntry('left-only.txt', 'left_only', { right: undefined }),
      createEntry('right-only.txt', 'right_only', { left: undefined }),
    ]

    const leftEntries = prepareCompareEntries(entries, {
      filter: 'all',
      pathFilter: [],
      hideDot: false,
      hideDotFilter: 'all',
      side: 'left',
    })

    const rightEntries = prepareCompareEntries(entries, {
      filter: 'all',
      pathFilter: [],
      hideDot: false,
      hideDotFilter: 'all',
      side: 'right',
    })

    expect(leftEntries.map((entry) => entry.relativePath)).toEqual(['same.txt', 'left-only.txt'])
    expect(rightEntries.map((entry) => entry.relativePath)).toEqual(['same.txt', 'right-only.txt'])
  })

  it('removes filtered paths by segment and nested path prefix', () => {
    const entries = [
      createEntry('dist', 'equal', { isDirectory: true }),
      createEntry('dist/app.js', 'equal'),
      createEntry('src', 'equal', { isDirectory: true }),
      createEntry('src/generated', 'equal', { isDirectory: true }),
      createEntry('src/generated/schema.ts', 'equal'),
      createEntry('src/index.ts', 'equal'),
    ]

    const result = prepareCompareEntries(entries, {
      filter: 'all',
      pathFilter: ['dist', 'src/generated'],
      hideDot: false,
      hideDotFilter: 'all',
    })

    expect(result.map((entry) => entry.relativePath)).toEqual(['src', 'src/index.ts'])
  })

  it('supports exact path rules without hiding same-named nested directories elsewhere', () => {
    const entries = [
      createEntry('config', 'equal', { isDirectory: true }),
      createEntry('config/app.php', 'equal'),
      createEntry('src', 'equal', { isDirectory: true }),
      createEntry('src/config', 'equal', { isDirectory: true }),
      createEntry('src/config/app.php', 'equal'),
    ]

    const result = prepareCompareEntries(entries, {
      filter: 'all',
      pathFilter: ['path:config'],
      hideDot: false,
      hideDotFilter: 'all',
    })

    expect(result.map((entry) => entry.relativePath)).toEqual([
      'src',
      'src/config',
      'src/config/app.php',
    ])
  })

  it('hides dot files and descendants under dot directories', () => {
    const entries = [
      createEntry('.env', 'equal'),
      createEntry('.git', 'equal', { isDirectory: true }),
      createEntry('.git/config', 'equal'),
      createEntry('src', 'equal', { isDirectory: true }),
      createEntry('src/.cache', 'equal', { isDirectory: true }),
      createEntry('src/.cache/tmp.txt', 'equal'),
      createEntry('src/app.ts', 'equal'),
    ]

    const result = prepareCompareEntries(entries, {
      filter: 'all',
      pathFilter: [],
      hideDot: true,
      hideDotFilter: 'all',
    })

    expect(result.map((entry) => entry.relativePath)).toEqual(['src', 'src/app.ts'])
  })

  it('propagates descendant states to directories and keeps ancestors for state filters', () => {
    const entries = [
      createEntry('src', 'equal', { isDirectory: true }),
      createEntry('src/components', 'equal', { isDirectory: true }),
      createEntry('src/components/Button.tsx', 'different'),
      createEntry('docs', 'equal', { isDirectory: true }),
      createEntry('docs/readme.md', 'equal'),
    ]

    const result = prepareCompareEntries(entries, {
      filter: 'different',
      pathFilter: [],
      hideDot: false,
      hideDotFilter: 'all',
    })

    expect(result.map((entry) => [entry.relativePath, entry.state])).toEqual([
      ['src', 'different'],
      ['src/components', 'different'],
      ['src/components/Button.tsx', 'different'],
    ])
  })

  it('supports filtering to entries that exist on both sides', () => {
    const entries = [
      createEntry('same.txt', 'equal'),
      createEntry('changed.txt', 'different'),
      createEntry('left-only.txt', 'left_only', { right: undefined }),
      createEntry('right-only.txt', 'right_only', { left: undefined }),
    ]

    const result = prepareCompareEntries(entries, {
      filter: 'paired',
      pathFilter: [],
      hideDot: false,
      hideDotFilter: 'all',
    })

    expect(result.map((entry) => entry.relativePath)).toEqual(['same.txt', 'changed.txt'])
  })

  it('hides entries from "equal" filter when any ancestor directory is still resolving', () => {
    const entries = [
      createEntry('done', 'equal', { isDirectory: true }),
      createEntry('done/file.txt', 'equal'),
      createEntry('busy', 'equal', { isDirectory: true }),
      createEntry('busy/known-equal.txt', 'equal'),
      createEntry('busy/still-pending.txt', 'pending'),
      createEntry('busy/still-comparing.txt', 'comparing'),
    ]

    const result = prepareCompareEntries(entries, {
      filter: 'equal',
      pathFilter: [],
      hideDot: false,
      hideDotFilter: 'all',
    })

    expect(result.map((entry) => entry.relativePath)).toEqual([
      'done',
      'done/file.txt',
    ])
  })

  it('shows pending and comparing entries (with their ancestors) under "unresolved" filter', () => {
    const entries = [
      createEntry('done.txt', 'equal'),
      createEntry('busy', 'comparing', { isDirectory: true }),
      createEntry('busy/queued.bin', 'pending'),
      createEntry('busy/in-flight.bin', 'comparing'),
      createEntry('busy/already-equal.bin', 'equal'),
    ]

    const result = prepareCompareEntries(entries, {
      filter: 'unresolved',
      pathFilter: [],
      hideDot: false,
      hideDotFilter: 'all',
    })

    expect(result.map((entry) => entry.relativePath)).toEqual([
      'busy',
      'busy/queued.bin',
      'busy/in-flight.bin',
    ])
  })

  it('treats common directories with one-sided descendants as different', () => {
    const entries = [
      createEntry('src', 'equal', { isDirectory: true }),
      createEntry('src/generated', 'equal', { isDirectory: true }),
      createEntry('src/generated/only-on-right.ts', 'right_only', { left: undefined }),
    ]

    const result = prepareCompareEntries(entries, {
      filter: 'all',
      pathFilter: [],
      hideDot: false,
      hideDotFilter: 'all',
    })

    expect(result.map((entry) => [entry.relativePath, entry.state])).toEqual([
      ['src', 'different'],
      ['src/generated', 'different'],
      ['src/generated/only-on-right.ts', 'right_only'],
    ])
  })

  it('reuses the input array when effective directory states do not change', () => {
    const entries = [
      createEntry('src', 'different', { isDirectory: true }),
      createEntry('src/app.ts', 'different'),
    ]

    const result = prepareCompareEntries(entries, {
      filter: 'all',
      pathFilter: [],
      hideDot: false,
      hideDotFilter: 'all',
    })

    expect(result).toBe(entries)
  })
})

describe('visible tree flow', () => {
  it('builds visible nodes from prepared entries and expanded directories', () => {
    const entries = [
      createEntry('src', 'equal', { isDirectory: true }),
      createEntry('src/components', 'equal', { isDirectory: true }),
      createEntry('src/components/Button.tsx', 'different'),
      createEntry('src/index.ts', 'equal'),
    ]

    const prepared = prepareCompareEntries(entries, {
      filter: 'different',
      pathFilter: [],
      hideDot: false,
      hideDotFilter: 'all',
    })

    const tree = buildTree(prepared)
    const visibleNodes = getVisibleNodes(tree, new Set(['src', 'src/components']))

    expect(visibleNodes.map((node) => node.relativePath)).toEqual([
      'src',
      'src/components',
      'src/components/Button.tsx',
    ])
  })

  it('builds visible nodes directly without constructing a nested tree', () => {
    const entries = [
      createEntry('src', 'equal', { isDirectory: true }),
      createEntry('src/components', 'equal', { isDirectory: true }),
      createEntry('src/components/Button.tsx', 'different'),
      createEntry('src/index.ts', 'equal'),
      createEntry('docs', 'equal', { isDirectory: true }),
      createEntry('docs/readme.md', 'equal'),
    ]

    const prepared = prepareCompareEntries(entries, {
      filter: 'all',
      pathFilter: [],
      hideDot: false,
      hideDotFilter: 'all',
    })

    const expandedDirs = new Set(['src'])
    const directVisibleNodes = buildVisibleNodes(prepared, expandedDirs)
    const treeVisibleNodes = getVisibleNodes(buildTree(prepared), expandedDirs)

    expect(directVisibleNodes.map((node) => node.relativePath)).toEqual(
      treeVisibleNodes.map((node) => node.relativePath),
    )
    expect(directVisibleNodes.map((node) => node.depth)).toEqual(
      treeVisibleNodes.map((node) => node.depth),
    )
  })
})
