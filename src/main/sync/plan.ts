import type { CompareEntry, SyncDirection, SyncItem } from '@shared/types'
import { joinSourcePath, normalizeRelativePath } from '@shared/source-path'

export interface SeededSyncQueues {
  readonly pendingItems: readonly SyncItem[]
  readonly pendingDirs: readonly string[]
  readonly totalItems: number
}

export function seedSyncQueues(
  entries: readonly CompareEntry[],
  direction: SyncDirection,
): SeededSyncQueues {
  const pendingItems: SyncItem[] = []
  const pendingDirs: string[] = []

  for (const entry of entries) {
    if (!shouldSyncEntry(entry, direction)) continue

    const relativePath = normalizeRelativePath(entry.relativePath, '/')

    if (entry.isDirectory) {
      pendingItems.push({ relativePath, kind: 'directory' })
      pendingDirs.push(relativePath)
      continue
    }

    pendingItems.push({ relativePath, kind: 'file' })
  }

  return {
    pendingItems,
    pendingDirs,
    totalItems: pendingItems.length,
  }
}

export function expandDirectoryEntries(
  parentRelativePath: string,
  children: readonly { name: string; isDirectory: boolean }[],
  sourceType: 'local' | 'sftp',
): SeededSyncQueues {
  const pendingItems: SyncItem[] = []
  const pendingDirs: string[] = []

  const sorted = [...children].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  const safeParentRelativePath = normalizeRelativePath(parentRelativePath, '/')

  for (const child of sorted) {
    const relativePath = joinSourcePath(sourceType, safeParentRelativePath, child.name)
    if (child.isDirectory) {
      pendingItems.push({ relativePath, kind: 'directory' })
      pendingDirs.push(relativePath)
      continue
    }
    pendingItems.push({ relativePath, kind: 'file' })
  }

  return {
    pendingItems,
    pendingDirs,
    totalItems: pendingItems.length,
  }
}

function shouldSyncEntry(entry: CompareEntry, direction: SyncDirection): boolean {
  if (entry.state === 'different') return !entry.isDirectory
  if (entry.isDirectory) {
    return direction === 'left_to_right' ? entry.state === 'left_only' : entry.state === 'right_only'
  }
  return direction === 'left_to_right' ? entry.state === 'left_only' : entry.state === 'right_only'
}
