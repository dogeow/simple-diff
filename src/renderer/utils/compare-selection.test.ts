import { describe, expect, it } from 'vitest'
import type { CompareEntry } from '../../../shared/types'
import { collectSyncEntriesForSelection, resolveCompareSelection } from './compare-selection'

function createEntry(relativePath: string, state: CompareEntry['state'], isDirectory = false): CompareEntry {
  return {
    relativePath,
    name: relativePath.split('/').at(-1) ?? relativePath,
    isDirectory,
    state,
    left: state !== 'right_only'
      ? { name: relativePath, path: relativePath, isDirectory, size: 1, mtime: 1 }
      : undefined,
    right: state !== 'left_only'
      ? { name: relativePath, path: relativePath, isDirectory, size: 1, mtime: 1 }
      : undefined,
    reasons: [],
  }
}

describe('compare-selection', () => {
  it('selects a contiguous range when shift is pressed', () => {
    const first = resolveCompareSelection(
      { selectedPaths: new Set(), anchorPath: null },
      {
        orderedPaths: ['a', 'b', 'c', 'd'],
        clickedPath: 'b',
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
      },
    )

    const second = resolveCompareSelection(first, {
      orderedPaths: ['a', 'b', 'c', 'd'],
      clickedPath: 'd',
      shiftKey: true,
      metaKey: false,
      ctrlKey: false,
    })

    expect(Array.from(second.selectedPaths)).toEqual(['b', 'c', 'd'])
    expect(second.anchorPath).toBe('b')
  })

  it('collects sync entries once per selected subtree root', () => {
    const entries: readonly CompareEntry[] = [
      createEntry('public', 'left_only', true),
      createEntry('public/cloud', 'left_only', true),
      createEntry('public/cloud/a.txt', 'left_only'),
      createEntry('public/items', 'left_only', true),
      createEntry('public/items/b.txt', 'left_only'),
    ]

    const selectedPaths = new Set(['public', 'public/cloud'])
    expect(collectSyncEntriesForSelection(entries, selectedPaths, 'left_to_right').map((entry) => entry.relativePath)).toEqual([
      'public',
      'public/cloud',
      'public/cloud/a.txt',
      'public/items',
      'public/items/b.txt',
    ])
  })
})