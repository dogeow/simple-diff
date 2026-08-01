import type { CompareEntry, SyncTaskItemSnapshot } from '../../../shared/types'
import { normalizeRelativePath } from '@shared/source-path'

function normalizeRelativePathForRecompare(relativePath: string): string | null {
  const trimmed = relativePath.trim()
  if (!trimmed || trimmed === '.' || trimmed === '/') {
    return ''
  }

  try {
    return normalizeRelativePath(trimmed, '/')
  } catch {
    return null
  }
}

function getParentPath(relativePath: string): string | null {
  const normalizedPath = normalizeRelativePathForRecompare(relativePath)
  if (normalizedPath === null) {
    return null
  }

  const lastSlashIndex = normalizedPath.lastIndexOf('/')
  return lastSlashIndex >= 0 ? normalizedPath.slice(0, lastSlashIndex) : ''
}

export function minimizeSyncRecompareRoots(roots: readonly string[]): readonly string[] {
  const normalizedRoots = new Set<string>()
  for (const root of roots) {
    const normalizedRoot = normalizeRelativePathForRecompare(root)
    if (normalizedRoot === null) {
      continue
    }

    normalizedRoots.add(normalizedRoot)
  }

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
  const normalized = new Set<string>()
  for (const entry of entries) {
    const normalizedPath = normalizeRelativePathForRecompare(entry.relativePath)
    if (normalizedPath !== null) {
      normalized.add(normalizedPath)
    }
  }

  return Array.from(normalized)
}

export function getSyncRecompareRootsFromEntries(entries: readonly CompareEntry[]): readonly string[] {
  return minimizeSyncRecompareRoots(entries.flatMap((entry) => {
    const path = entry.isDirectory ? entry.relativePath : getParentPath(entry.relativePath)
    return path === null ? [] : [path]
  }))
}

export function getSyncRecompareRootsFromItems(items: readonly SyncTaskItemSnapshot[] | undefined): readonly string[] {
  if (!items || items.length === 0) {
    return []
  }

  return minimizeSyncRecompareRoots(items.flatMap((item) => {
    const path = item.kind === 'directory' ? item.relativePath : getParentPath(item.relativePath)
    return path === null ? [] : [path]
  }))
}

/**
 * Watch / dirty 路径重比时始终取「父目录」：文件或目录自身变更都需要父级重扫，
 * 才能发现新增/删除邻居。再经 minimize 去掉被祖先覆盖的根。
 */
export function getDirtyRecompareRoots(dirtyPaths: ReadonlySet<string> | Iterable<string>): readonly string[] {
  const parents: string[] = []
  for (const dirtyPath of dirtyPaths) {
    const parent = getParentPath(dirtyPath)
    if (parent !== null) {
      parents.push(parent)
    }
  }
  return minimizeSyncRecompareRoots(parents)
}
