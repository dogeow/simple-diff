import type { CompareEntry, SyncTaskItemSnapshot } from '../../../shared/types'

function normalizeRelativePath(relativePath: string): string {
  const trimmed = relativePath.trim()
  if (!trimmed || trimmed === '.' || trimmed === '/') {
    return ''
  }

  return trimmed.split(/[\\/]+/).filter(Boolean).join('/')
}

function getParentPath(relativePath: string): string {
  const normalizedPath = normalizeRelativePath(relativePath)
  const lastSlashIndex = normalizedPath.lastIndexOf('/')
  return lastSlashIndex >= 0 ? normalizedPath.slice(0, lastSlashIndex) : ''
}

export function minimizeSyncRecompareRoots(roots: readonly string[]): readonly string[] {
  const normalizedRoots = new Set(roots.map(normalizeRelativePath))
  if (normalizedRoots.has('')) {
    return ['']
  }

  const sortedRoots = Array.from(normalizedRoots).sort((a, b) => a.length - b.length || a.localeCompare(b))
  const minimizedRoots: string[] = []

  for (const root of sortedRoots) {
    if (minimizedRoots.some((candidate) => root === candidate || root.startsWith(`${candidate}/`))) {
      continue
    }

    minimizedRoots.push(root)
  }

  return minimizedRoots
}

export function getSyncDirtyPathsFromEntries(entries: readonly CompareEntry[]): readonly string[] {
  return Array.from(new Set(entries.map((entry) => normalizeRelativePath(entry.relativePath))))
}

export function getSyncRecompareRootsFromEntries(entries: readonly CompareEntry[]): readonly string[] {
  return minimizeSyncRecompareRoots(entries.map((entry) => (
    entry.isDirectory ? entry.relativePath : getParentPath(entry.relativePath)
  )))
}

export function getSyncRecompareRootsFromItems(items: readonly SyncTaskItemSnapshot[] | undefined): readonly string[] {
  if (!items || items.length === 0) {
    return []
  }

  return minimizeSyncRecompareRoots(items.map((item) => (
    item.kind === 'directory' ? item.relativePath : getParentPath(item.relativePath)
  )))
}