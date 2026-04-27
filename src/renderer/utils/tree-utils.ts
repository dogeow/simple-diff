import type { CompareEntry, CompareFilter, CompareState } from '../../../shared/types'
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

interface EntrySortInfo {
  readonly entry: CompareEntry
  readonly segments: readonly string[]
}

function isDirectoryAtSegment(info: EntrySortInfo, segmentIndex: number): boolean {
  return segmentIndex < info.segments.length - 1 || info.entry.isDirectory
}

function compareEntrySortInfo(a: EntrySortInfo, b: EntrySortInfo): number {
  const minLength = Math.min(a.segments.length, b.segments.length)

  for (let i = 0; i < minLength; i++) {
    const aSegment = a.segments[i]
    const bSegment = b.segments[i]

    if (aSegment === bSegment) continue

    const aIsDirectory = isDirectoryAtSegment(a, i)
    const bIsDirectory = isDirectoryAtSegment(b, i)
    if (aIsDirectory !== bIsDirectory) {
      return aIsDirectory ? -1 : 1
    }

    return aSegment.localeCompare(bSegment)
  }

  return a.segments.length - b.segments.length
}

function sortEntryInfos(entries: readonly CompareEntry[]): EntrySortInfo[] {
  return entries
    .map((entry) => ({ entry, segments: entry.relativePath.split('/') }))
    .sort(compareEntrySortInfo)
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

  const sorted = sortEntryInfos(entries)

  for (const { entry, segments } of sorted) {
    const parts = segments
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

export function buildVisibleNodes(
  entries: readonly CompareEntry[],
  expandedDirs: ReadonlySet<string>,
): readonly TreeNode[] {
  const result: TreeNode[] = []
  const sorted = sortEntryInfos(entries)
  let hiddenPrefix: string | null = null

  for (const { entry, segments } of sorted) {
    if (hiddenPrefix && entry.relativePath.startsWith(`${hiddenPrefix}/`)) {
      continue
    }

    hiddenPrefix = null
    result.push({
      name: entry.name,
      relativePath: entry.relativePath,
      isDirectory: entry.isDirectory,
      entry,
      children: [],
      depth: segments.length - 1,
    })

    if (entry.isDirectory && !expandedDirs.has(entry.relativePath)) {
      hiddenPrefix = entry.relativePath
    }
  }

  return result
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

function prefilterEntries(
  entries: readonly CompareEntry[],
  options: {
    readonly pathFilter: readonly string[]
    readonly hideDot: boolean
    readonly hideDotFilter: DotEntryFilter
    readonly side?: TreeSide
  },
): readonly CompareEntry[] {
  const { pathFilter, hideDot, hideDotFilter, side } = options
  const shouldFilterByPath = pathFilter.length > 0
  const shouldFilterBySide = side != null
  let nextEntries: CompareEntry[] | null = null

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]

    if (shouldFilterBySide) {
      const hiddenBySide = side === 'left'
        ? entry.state === 'right_only'
        : entry.state === 'left_only'

      if (hiddenBySide) {
        if (!nextEntries) {
          nextEntries = entries.slice(0, index)
        }
        continue
      }
    }

    if (shouldFilterByPath && matchesPathFilter(entry.relativePath, pathFilter)) {
      if (!nextEntries) {
        nextEntries = entries.slice(0, index)
      }
      continue
    }

    if (hideDot) {
      const hiddenByDotAncestor = hasDotAncestor(entry.relativePath)
      const hiddenByDotName = entry.name.startsWith('.') && (
        hideDotFilter === 'all'
          || (hideDotFilter === 'files' && !entry.isDirectory)
          || (hideDotFilter === 'dirs' && entry.isDirectory)
      )

      if (hiddenByDotAncestor || hiddenByDotName) {
        if (!nextEntries) {
          nextEntries = entries.slice(0, index)
        }
        continue
      }
    }

    if (nextEntries) {
      nextEntries.push(entry)
    }
  }

  return nextEntries ?? entries
}

function applyEffectiveDirectoryStates(entries: readonly CompareEntry[]): readonly CompareEntry[] {
  const effectiveDirStates = computeEffectiveDirStates(entries)
  if (effectiveDirStates.size === 0) {
    return entries
  }

  let nextEntries: CompareEntry[] | null = null

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const effective = entry.isDirectory ? effectiveDirStates.get(entry.relativePath) : undefined

    if (!effective || effective === entry.state) {
      if (nextEntries) {
        nextEntries.push(entry)
      }
      continue
    }

    if (!nextEntries) {
      nextEntries = entries.slice(0, index)
    }

    nextEntries.push({ ...entry, state: effective })
  }

  return nextEntries ?? entries
}

export function matchesCompareFilter(targetFilter: CompareFilter, entry: CompareEntry): boolean {
  if (targetFilter === 'all') return true
  if (targetFilter === 'paired') {
    return Boolean(entry.left && entry.right)
  }
  if (targetFilter === 'different') {
    return entry.state === 'different' || entry.state === 'left_only' || entry.state === 'right_only'
  }
  if (targetFilter === 'unresolved') {
    return entry.state === 'pending' || entry.state === 'comparing'
  }
  return entry.state === targetFilter
}

function hasUnresolvedAncestor(
  relativePath: string,
  unresolvedDirs: ReadonlySet<string>,
): boolean {
  const parts = relativePath.split('/')
  for (let i = 1; i < parts.length; i++) {
    if (unresolvedDirs.has(parts.slice(0, i).join('/'))) return true
  }
  return false
}

function filterEntriesByState(
  entries: readonly CompareEntry[],
  targetFilter: CompareFilter,
): readonly CompareEntry[] {
  if (targetFilter === 'all') return entries

  if (targetFilter === 'equal') {
    const unresolvedDirs = new Set<string>()
    for (const entry of entries) {
      if (entry.isDirectory && entry.state !== 'equal') {
        unresolvedDirs.add(entry.relativePath)
      }
    }
    return entries.filter((entry) => {
      if (entry.state !== 'equal') return false
      return !hasUnresolvedAncestor(entry.relativePath, unresolvedDirs)
    })
  }

  const neededDirs = new Set<string>()
  for (const entry of entries) {
    if (!matchesCompareFilter(targetFilter, entry)) continue

    const parts = entry.relativePath.split('/')
    for (let i = 1; i < parts.length; i++) {
      neededDirs.add(parts.slice(0, i).join('/'))
    }
    if (entry.isDirectory) neededDirs.add(entry.relativePath)
  }

  return entries.filter((entry) => {
    if (entry.isDirectory) return neededDirs.has(entry.relativePath)
    return matchesCompareFilter(targetFilter, entry)
  })
}

export interface PrepareCompareEntriesOptions {
  readonly filter: CompareFilter
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

  let result = prefilterEntries(entries, {
    pathFilter,
    hideDot,
    hideDotFilter,
    side,
  })

  result = applyEffectiveDirectoryStates(result)
  return filterEntriesByState(result, filter)
}

const DIR_STATE_PRIORITY: CompareState[] = ['different', 'comparing', 'pending', 'equal']

/**
 * Compute effective directory states by propagating descendant entry states upward.
 * A directory's effective state is the highest-priority state among its descendants.
 */
export function computeEffectiveDirStates(entries: readonly CompareEntry[]): ReadonlyMap<string, CompareState> {
  const entryByPath = new Map<string, CompareEntry>()
  const dirStates = new Map<string, Set<CompareState>>()

  for (const entry of entries) {
    entryByPath.set(entry.relativePath, entry)

    const parts = entry.relativePath.split('/')
    let ancestorPath = ''
    for (let i = 0; i < parts.length - 1; i++) {
      ancestorPath = ancestorPath ? `${ancestorPath}/${parts[i]}` : parts[i]
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
