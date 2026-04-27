import { describe, expect, it } from 'vitest'
import type { CompareEntry, CompareState } from '../../../shared/types'
import { collectBusyDirectoryPaths, hasLoadingDescendantDirectory, shouldShowDirectorySpinner } from './tree-row-utils'

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

describe('collectBusyDirectoryPaths', () => {
  it('marks ancestor directories as busy while a descendant directory is still comparing', () => {
    const busyPaths = collectBusyDirectoryPaths([
      createEntry('src', 'equal', { isDirectory: true }),
      createEntry('src/changed.txt', 'different'),
      createEntry('src/nested', 'comparing', { isDirectory: true }),
      createEntry('src/nested/file.txt', 'pending'),
    ], new Set())

    expect(busyPaths.has('src')).toBe(true)
    expect(busyPaths.has('src/nested')).toBe(true)
  })

  it('marks ancestor directories as busy when a descendant directory is lazily loading', () => {
    const busyPaths = collectBusyDirectoryPaths([
      createEntry('src', 'equal', { isDirectory: true }),
      createEntry('src/nested', 'equal', { isDirectory: true }),
    ], new Set(['src/nested']))

    expect(busyPaths.has('src')).toBe(true)
    expect(busyPaths.has('src/nested')).toBe(true)
  })
})

describe('shouldShowDirectorySpinner', () => {
  it('shows a spinner when a directory is lazily loading', () => {
    expect(shouldShowDirectorySpinner(true, true, 'equal')).toBe(true)
  })

  it('shows a spinner when a directory is actively comparing', () => {
    expect(shouldShowDirectorySpinner(true, false, 'comparing')).toBe(true)
  })

  it('shows a spinner when a directory is still pending', () => {
    expect(shouldShowDirectorySpinner(true, false, 'pending')).toBe(true)
  })

  it('does not show a spinner for non-directory compare states', () => {
    expect(shouldShowDirectorySpinner(true, false, 'equal')).toBe(false)
    expect(shouldShowDirectorySpinner(false, false, 'comparing')).toBe(false)
  })
})

describe('hasLoadingDescendantDirectory', () => {
  it('matches both the loading directory itself and its visible ancestors', () => {
    const loadingDirs = new Set(['src/nested'])

    expect(hasLoadingDescendantDirectory('src', loadingDirs)).toBe(true)
    expect(hasLoadingDescendantDirectory('src/nested', loadingDirs)).toBe(true)
    expect(hasLoadingDescendantDirectory('docs', loadingDirs)).toBe(false)
  })
})