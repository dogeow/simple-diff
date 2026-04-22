import type { CompareEntry, CompareState } from '../../../shared/types'
import { matchesPathFilter } from '@shared/path-filter'

export type TreeSide = 'left' | 'right'
export type DotEntryFilter = 'all' | 'files' | 'dirs'

/**
 * Truncate path by hiding the middle parts with .../.../
 * - If fits: keep first + all middle dirs + last
 * - If too long: keep only first + last with minimal dots
 * e.g., "/home/user/project/src/components/Button.tsx" -> "/home/.../.../.../components/Button.tsx"
 * e.g., "/Users/very/deep/nested/path/Documents" -> "/Users/.../Documents"
 */
export function truncatePath(path: string, maxLength = 60): string {
  if (path.length <= maxLength) return path

  // Handle sftp paths
  if (path.startsWith('sftp://')) {
    const [protocol, rest] = path.split('://')
    const [configId, filePath] = rest.split(':')
    const truncated = truncateFilePath(filePath, maxLength - protocol.length - configId.length - 4)
    return `${protocol}://${configId}:${truncated}`
  }

  // Handle local paths
  return truncateFilePath(path, maxLength)
}

function truncateFilePath(path: string, maxLength: number): string {
  if (path.length <= maxLength) return path

  const parts = path.split('/').filter((p) => p !== '')
  if (parts.length <= 2) return path // Not worth truncating

  const firstParts = [parts[0]]
  const lastParts = [parts[parts.length - 1]]
  let left = 1
  let right = parts.length - 2

  const render = (head: readonly string[], tail: readonly string[]) => `/${head.join('/')}/.../${tail.join('/')}`

  let best = render(firstParts, lastParts)

  while (left <= right) {
    const candidateWithMoreHead = render([...firstParts, parts[left]], lastParts)
    if (candidateWithMoreHead.length <= maxLength) {
      firstParts.push(parts[left])
      best = candidateWithMoreHead
      left++
      continue
    }

    const candidateWithMoreTail = render(firstParts, [parts[right], ...lastParts])
    if (candidateWithMoreTail.length <= maxLength) {
      lastParts.unshift(parts[right])
      best = candidateWithMoreTail
      right--
      continue
    }

    break
  }

  return best
}

export interface TreeNode {
  readonly name: string
  readonly relativePath: string
  readonly isDirectory: boolean
  readonly entry: CompareEntry | null
  readonly children: TreeNode[]
  readonly depth: number
}

export function buildTree(entries: readonly CompareEntry[]): TreeNode {
  const root: TreeNode = {
    name: '',
    relativePath: '',
    isDirectory: true,
    entry: null,
    children: [],
    depth: -1,
  }

  const dirMap = new Map<string, TreeNode>()
  dirMap.set('', root)

  const sorted = [...entries].sort((a, b) => a.relativePath.localeCompare(b.relativePath))

  for (const entry of sorted) {
    const parts = entry.relativePath.split('/')
    const parentPath = parts.slice(0, -1).join('/')

    const node: TreeNode = {
      name: entry.name,
      relativePath: entry.relativePath,
      isDirectory: entry.isDirectory,
      entry,
      children: [],
      depth: parts.length - 1,
    }

    const parent = dirMap.get(parentPath) ?? root
    parent.children.push(node)

    if (entry.isDirectory) {
      dirMap.set(entry.relativePath, node)
    }
  }

  sortTree(root)
  return root
}

export function getVisibleNodes(
  root: TreeNode,
  expandedDirs: ReadonlySet<string>,
): readonly TreeNode[] {
  const result: TreeNode[] = []

  function walk(node: TreeNode): void {
    if (node.depth >= 0) {
      result.push(node)
    }

    if (node.isDirectory && (node.depth < 0 || expandedDirs.has(node.relativePath))) {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  walk(root)
  return result
}

function sortTree(node: TreeNode): void {
  node.children.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  for (const child of node.children) {
    if (child.isDirectory) {
      sortTree(child)
    }
  }
}

export function getAllDirPaths(entries: readonly CompareEntry[]): ReadonlySet<string> {
  const dirs = new Set<string>()
  for (const entry of entries) {
    if (entry.isDirectory) {
      dirs.add(entry.relativePath)
    }
  }
  return dirs
}

export function filterEntriesByPaths(
  entries: readonly CompareEntry[],
  pathFilter: readonly string[],
): readonly CompareEntry[] {
  if (pathFilter.length === 0) return entries
  return entries.filter((entry) => !matchesPathFilter(entry.relativePath, pathFilter))
}

export function filterEntriesBySide(
  entries: readonly CompareEntry[],
  side?: TreeSide,
): readonly CompareEntry[] {
  if (!side) return entries

  return entries.filter((entry) => {
    if (side === 'left') return entry.state !== 'right_only'
    return entry.state !== 'left_only'
  })
}

function hasDotAncestor(relativePath: string): boolean {
  const parts = relativePath.split('/')
  return parts.slice(0, -1).some((part) => part.startsWith('.'))
}

function filterHiddenDotEntries(
  entries: readonly CompareEntry[],
  hideDotFilter: DotEntryFilter,
): readonly CompareEntry[] {
  return entries.filter((entry) => {
    if (hasDotAncestor(entry.relativePath)) return false

    if (!entry.name.startsWith('.')) return true
    if (hideDotFilter === 'all') return false
    if (hideDotFilter === 'files' && !entry.isDirectory) return false
    if (hideDotFilter === 'dirs' && entry.isDirectory) return false
    return true
  })
}

function applyEffectiveDirectoryStates(entries: readonly CompareEntry[]): readonly CompareEntry[] {
  const effectiveDirStates = computeEffectiveDirStates(entries)
  return entries.map((entry) => {
    if (!entry.isDirectory) return entry
    const effective = effectiveDirStates.get(entry.relativePath)
    if (effective && effective !== entry.state) {
      return { ...entry, state: effective }
    }
    return entry
  })
}

function matchesStateFilter(targetFilter: CompareState | 'all', state: CompareState): boolean {
  if (targetFilter === 'all') return true
  if (targetFilter === 'different') {
    return state === 'different' || state === 'left_only' || state === 'right_only'
  }
  return state === targetFilter
}

function filterEntriesByState(
  entries: readonly CompareEntry[],
  targetFilter: CompareState | 'all',
): readonly CompareEntry[] {
  if (targetFilter === 'all') return entries

  const neededDirs = new Set<string>()
  for (const entry of entries) {
    if (!matchesStateFilter(targetFilter, entry.state)) continue

    const parts = entry.relativePath.split('/')
    for (let i = 1; i < parts.length; i++) {
      neededDirs.add(parts.slice(0, i).join('/'))
    }
    if (entry.isDirectory) neededDirs.add(entry.relativePath)
  }

  return entries.filter((entry) => {
    if (entry.isDirectory) return neededDirs.has(entry.relativePath)
    return matchesStateFilter(targetFilter, entry.state)
  })
}

export interface PrepareCompareEntriesOptions {
  readonly filter: CompareState | 'all'
  readonly pathFilter: readonly string[]
  readonly hideDot: boolean
  readonly hideDotFilter: DotEntryFilter
  readonly side?: TreeSide
}

export function prepareCompareEntries(
  entries: readonly CompareEntry[],
  options: PrepareCompareEntriesOptions,
): readonly CompareEntry[] {
  const { filter, pathFilter, hideDot, hideDotFilter, side } = options

  let result = filterEntriesBySide(entries, side)
  result = filterEntriesByPaths(result, pathFilter)

  if (hideDot) {
    result = filterHiddenDotEntries(result, hideDotFilter)
  }

  result = applyEffectiveDirectoryStates(result)
  return filterEntriesByState(result, filter)
}

const DIR_STATE_PRIORITY: CompareState[] = ['different', 'comparing', 'pending', 'equal']

/**
 * Compute effective directory states by propagating descendant entry states upward.
 * A directory's effective state is the highest-priority state among its descendants.
 */
export function computeEffectiveDirStates(entries: readonly CompareEntry[]): ReadonlyMap<string, CompareState> {
  const entryByPath = new Map(entries.map((entry) => [entry.relativePath, entry]))
  const dirStates = new Map<string, Set<CompareState>>()

  for (const entry of entries) {
    const parts = entry.relativePath.split('/')
    for (let i = 1; i < parts.length; i++) {
      const ancestorPath = parts.slice(0, i).join('/')
      let stateSet = dirStates.get(ancestorPath)
      if (!stateSet) {
        stateSet = new Set()
        dirStates.set(ancestorPath, stateSet)
      }
      stateSet.add(entry.state)
    }
  }

  const result = new Map<string, CompareState>()
  for (const [dirPath, states] of dirStates) {
    const dirEntry = entryByPath.get(dirPath)
    if (!dirEntry?.isDirectory) continue

    if (dirEntry.state === 'left_only' || dirEntry.state === 'right_only') {
      result.set(dirPath, dirEntry.state)
      continue
    }

    if (states.has('different') || states.has('left_only') || states.has('right_only')) {
      result.set(dirPath, 'different')
      continue
    }

    for (const p of DIR_STATE_PRIORITY) {
      if (states.has(p)) {
        result.set(dirPath, p)
        break
      }
    }
  }

  return result
}
