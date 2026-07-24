import type { CompareSessionSnapshot } from './types'

export function normalizeDirtyPath(relativePath: string): string {
  const trimmed = relativePath.trim()
  if (!trimmed || trimmed === '.' || trimmed === '/') {
    return ''
  }

  return trimmed.split(/[\\/]+/).filter(Boolean).join('/')
}

export function cloneDirtyPaths(dirtyPaths: ReadonlySet<string>): readonly string[] {
  return Array.from(dirtyPaths).sort((a, b) => a.length - b.length || a.localeCompare(b))
}

export function buildDirtyDisplayPaths(dirtyPaths: ReadonlySet<string>): ReadonlySet<string> {
  const displayPaths = new Set<string>()

  for (const dirtyPath of dirtyPaths) {
    if (!dirtyPath) {
      displayPaths.add('')
      continue
    }

    const segments = dirtyPath.split('/')
    let currentPath = ''
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment
      displayPaths.add(currentPath)
    }
  }

  return displayPaths
}

export function mergeDirtyPathSet(
  currentDirtyPaths: ReadonlySet<string>,
  incomingPaths: readonly string[],
): { readonly dirtyPaths: ReadonlySet<string>; readonly dirtyDisplayPaths: ReadonlySet<string> } {
  const nextDirtyPaths = new Set(currentDirtyPaths)

  for (const path of incomingPaths) {
    nextDirtyPaths.add(normalizeDirtyPath(path))
  }

  return {
    dirtyPaths: nextDirtyPaths,
    dirtyDisplayPaths: buildDirtyDisplayPaths(nextDirtyPaths),
  }
}

function isPathInsideRoot(root: string, candidatePath: string): boolean {
  if (!root) {
    return true
  }

  return candidatePath === root || candidatePath.startsWith(`${root}/`)
}

export function clearDirtyPathSet(
  currentDirtyPaths: ReadonlySet<string>,
  roots?: readonly string[],
): { readonly dirtyPaths: ReadonlySet<string>; readonly dirtyDisplayPaths: ReadonlySet<string> } {
  if (!roots || roots.length === 0) {
    return {
      dirtyPaths: new Set<string>(),
      dirtyDisplayPaths: new Set<string>(),
    }
  }

  const normalizedRoots = roots.map(normalizeDirtyPath)
  if (normalizedRoots.includes('')) {
    return {
      dirtyPaths: new Set<string>(),
      dirtyDisplayPaths: new Set<string>(),
    }
  }

  const nextDirtyPaths = new Set<string>()
  for (const dirtyPath of currentDirtyPaths) {
    if (normalizedRoots.some((root) => isPathInsideRoot(root, dirtyPath))) {
      continue
    }
    nextDirtyPaths.add(dirtyPath)
  }

  return {
    dirtyPaths: nextDirtyPaths,
    dirtyDisplayPaths: buildDirtyDisplayPaths(nextDirtyPaths),
  }
}

export function applyDirtyPathsToSnapshot(
  snapshot: CompareSessionSnapshot,
  paths: readonly string[],
): CompareSessionSnapshot {
  const mergedDirtyPaths = mergeDirtyPathSet(new Set(snapshot.dirtyPaths ?? []), paths)
  return {
    ...snapshot,
    dirtyPaths: cloneDirtyPaths(mergedDirtyPaths.dirtyPaths),
  }
}

export function clearDirtyPathsFromSnapshot(
  snapshot: CompareSessionSnapshot,
  roots?: readonly string[],
): CompareSessionSnapshot {
  const clearedDirtyPaths = clearDirtyPathSet(new Set(snapshot.dirtyPaths ?? []), roots)
  return {
    ...snapshot,
    dirtyPaths: cloneDirtyPaths(clearedDirtyPaths.dirtyPaths),
  }
}
