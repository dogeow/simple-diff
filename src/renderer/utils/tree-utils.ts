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
  readonly children?: TreeNode[]
  readonly depth: number
}

export interface VisibleTreeNodes {
  readonly length: number
  get: (index: number) => TreeNode | undefined
  slice: (start?: number, end?: number) => readonly TreeNode[]
  toArray: () => readonly TreeNode[]
  toPathArray: () => readonly string[]
  hasPath: (relativePath: string) => boolean
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

const sortedEntryInfoCache = new WeakMap<readonly CompareEntry[], EntrySortInfo[]>()

function sortEntryInfos(entries: readonly CompareEntry[]): EntrySortInfo[] {
  const cached = sortedEntryInfoCache.get(entries)
  if (cached) return cached

  const next = entries
    .map((entry) => ({ entry, segments: entry.relativePath.split('/') }))
    .sort(compareEntrySortInfo)
  sortedEntryInfoCache.set(entries, next)
  return next
}

function createTreeNode(info: EntrySortInfo): TreeNode {
  const { entry, segments } = info
  return {
    name: entry.name,
    relativePath: entry.relativePath,
    isDirectory: entry.isDirectory,
    entry,
    depth: segments.length - 1,
  }
}

function clampSliceIndex(value: number | undefined, length: number, fallback: number): number {
  if (value == null) return fallback
  const normalized = value < 0 ? length + value : value
  return Math.max(0, Math.min(length, normalized))
}

function createVisibleTreeNodes(
  sorted: readonly EntrySortInfo[],
  indexes: Int32Array | null,
  length: number,
): VisibleTreeNodes {
  const getInfo = (index: number): EntrySortInfo | undefined => {
    if (index < 0 || index >= length) return undefined
    return indexes ? sorted[indexes[index]] : sorted[index]
  }

  return {
    length,
    get: (index) => {
      const info = getInfo(index)
      return info ? createTreeNode(info) : undefined
    },
    slice: (start, end) => {
      const safeStart = clampSliceIndex(start, length, 0)
      const safeEnd = clampSliceIndex(end, length, length)
      if (safeEnd <= safeStart) return []
      const result: TreeNode[] = []
      for (let index = safeStart; index < safeEnd; index += 1) {
        const info = getInfo(index)
        if (info) result.push(createTreeNode(info))
      }
      return result
    },
    toArray: () => {
      const result: TreeNode[] = []
      for (let index = 0; index < length; index += 1) {
        const info = getInfo(index)
        if (info) result.push(createTreeNode(info))
      }
      return result
    },
    toPathArray: () => {
      const result: string[] = []
      for (let index = 0; index < length; index += 1) {
        const info = getInfo(index)
        if (info) result.push(info.entry.relativePath)
      }
      return result
    },
    hasPath: (relativePath) => {
      for (let index = 0; index < length; index += 1) {
        const info = getInfo(index)
        if (info?.entry.relativePath === relativePath) return true
      }
      return false
    },
  }
}

interface TreeBuildNode extends TreeNode {
  readonly children: TreeNode[]
}

export function buildTree(entries: readonly CompareEntry[]): TreeNode {
  const root: TreeBuildNode = {
    name: '',
    relativePath: '',
    isDirectory: true,
    entry: null,
    children: [],
    depth: -1,
  }

  const dirMap = new Map<string, TreeBuildNode>()
  dirMap.set('', root)

  const sorted = sortEntryInfos(entries)

  for (const { entry, segments } of sorted) {
    const parts = segments
    const parentPath = parts.slice(0, -1).join('/')

    const node: TreeBuildNode = {
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
  return buildVisibleNodeList(entries, expandedDirs).toArray()
}

export function buildVisibleNodeList(
  entries: readonly CompareEntry[],
  expandedDirs: ReadonlySet<string>,
): VisibleTreeNodes {
  const sorted = sortEntryInfos(entries)
  let hiddenPrefix: string | null = null
  let indexes: number[] | null = null
  let visibleCount = 0

  for (let sortedIndex = 0; sortedIndex < sorted.length; sortedIndex += 1) {
    const { entry } = sorted[sortedIndex]
    if (hiddenPrefix && entry.relativePath.startsWith(`${hiddenPrefix}/`)) {
      continue
    }

    hiddenPrefix = null
    if (indexes) {
      indexes.push(sortedIndex)
    } else if (sortedIndex !== visibleCount) {
      indexes = []
      for (let index = 0; index < visibleCount; index += 1) {
        indexes.push(index)
      }
      indexes.push(sortedIndex)
    }
    visibleCount += 1

    if (entry.isDirectory && !expandedDirs.has(entry.relativePath)) {
      hiddenPrefix = entry.relativePath
    }
  }

  return createVisibleTreeNodes(sorted, indexes ? Int32Array.from(indexes) : null, visibleCount)
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
      if (node.children) {
        for (const child of node.children) {
          walk(child)
        }
      }
    }
  }

  walk(root)
  return result
}

function sortTree(node: TreeNode): void {
  if (!node.children) return
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

function matchesFilterWithState(
  targetFilter: CompareFilter,
  entry: CompareEntry,
  effectiveState: CompareState,
): boolean {
  if (targetFilter === 'all') return true
  if (targetFilter === 'paired') {
    return Boolean(entry.left && entry.right)
  }
  if (targetFilter === 'different') {
    return effectiveState === 'different' || effectiveState === 'left_only' || effectiveState === 'right_only'
  }
  if (targetFilter === 'unresolved') {
    return effectiveState === 'pending' || effectiveState === 'comparing'
  }
  return effectiveState === targetFilter
}

function hasAncestorIn(relativePath: string, set: ReadonlySet<string>): boolean {
  let current = relativePath
  let slashIdx = current.lastIndexOf('/')
  while (slashIdx > 0) {
    current = current.slice(0, slashIdx)
    if (set.has(current)) return true
    slashIdx = current.lastIndexOf('/')
  }
  return false
}

function addAncestorPaths(relativePath: string, set: Set<string>): void {
  let current = relativePath
  let slashIdx = current.lastIndexOf('/')
  while (slashIdx > 0) {
    current = current.slice(0, slashIdx)
    set.add(current)
    slashIdx = current.lastIndexOf('/')
  }
}

/**
 * Single combined pass that applies effective directory states and filters by state.
 * Replaces three sequential passes (effective override, neededDirs collection, filter)
 * with at most two passes — the second only when a state filter is active.
 */
function applyEffectiveAndFilter(
  entries: readonly CompareEntry[],
  targetFilter: CompareFilter,
): readonly CompareEntry[] {
  const effectiveDirStates = computeEffectiveDirStates(entries)

  if (targetFilter === 'all') {
    if (effectiveDirStates.size === 0) return entries
    let nextEntries: CompareEntry[] | null = null
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i]
      const effective = entry.isDirectory ? effectiveDirStates.get(entry.relativePath) : undefined
      if (!effective || effective === entry.state) {
        if (nextEntries) nextEntries.push(entry)
        continue
      }
      if (!nextEntries) nextEntries = entries.slice(0, i)
      nextEntries.push({ ...entry, state: effective })
    }
    return nextEntries ?? entries
  }

  if (targetFilter === 'equal') {
    const unresolvedDirs = new Set<string>()
    for (const entry of entries) {
      if (!entry.isDirectory) continue
      const effective = effectiveDirStates.get(entry.relativePath) ?? entry.state
      if (effective !== 'equal') unresolvedDirs.add(entry.relativePath)
    }
    const result: CompareEntry[] = []
    for (const entry of entries) {
      const effective = entry.isDirectory
        ? effectiveDirStates.get(entry.relativePath) ?? entry.state
        : entry.state
      if (effective !== 'equal') continue
      if (hasAncestorIn(entry.relativePath, unresolvedDirs)) continue
      if (entry.isDirectory && effective !== entry.state) {
        result.push({ ...entry, state: effective })
      } else {
        result.push(entry)
      }
    }
    return result
  }

  // Other filters: dirs are kept iff a matching descendant exists or the dir itself matches.
  const neededDirs = new Set<string>()
  for (const entry of entries) {
    const effective = entry.isDirectory
      ? effectiveDirStates.get(entry.relativePath) ?? entry.state
      : entry.state
    if (!matchesFilterWithState(targetFilter, entry, effective)) continue
    addAncestorPaths(entry.relativePath, neededDirs)
    if (entry.isDirectory) neededDirs.add(entry.relativePath)
  }

  const result: CompareEntry[] = []
  for (const entry of entries) {
    if (entry.isDirectory) {
      if (!neededDirs.has(entry.relativePath)) continue
      const effective = effectiveDirStates.get(entry.relativePath)
      if (effective && effective !== entry.state) {
        result.push({ ...entry, state: effective })
      } else {
        result.push(entry)
      }
    } else {
      if (!matchesFilterWithState(targetFilter, entry, entry.state)) continue
      result.push(entry)
    }
  }
  return result
}

export interface PrepareCompareEntriesOptions {
  readonly filter: CompareFilter
  readonly pathFilter: readonly string[]
  readonly hideDot: boolean
  readonly hideDotFilter: DotEntryFilter
  readonly side?: TreeSide
}

interface PreparedCacheEntry {
  readonly key: string
  readonly value: readonly CompareEntry[]
}
const preparedEntriesCache = new WeakMap<readonly CompareEntry[], PreparedCacheEntry>()

export function prepareCompareEntries(
  entries: readonly CompareEntry[],
  options: PrepareCompareEntriesOptions,
): readonly CompareEntry[] {
  const { filter, pathFilter, hideDot, hideDotFilter, side } = options
  const cacheKey = `${filter}|${hideDot ? 1 : 0}|${hideDotFilter}|${side ?? ''}|${pathFilter.join('\u0001')}`
  const cached = preparedEntriesCache.get(entries)
  if (cached && cached.key === cacheKey) return cached.value

  const prefiltered = prefilterEntries(entries, {
    pathFilter,
    hideDot,
    hideDotFilter,
    side,
  })

  const value = applyEffectiveAndFilter(prefiltered, filter)
  preparedEntriesCache.set(entries, { key: cacheKey, value })
  return value
}

const DIR_STATE_PRIORITY: CompareState[] = ['different', 'comparing', 'pending', 'equal']

const effectiveDirStateCache = new WeakMap<readonly CompareEntry[], ReadonlyMap<string, CompareState>>()

/**
 * Compute effective directory states by propagating descendant entry states upward.
 * A directory's effective state is the highest-priority state among its descendants.
 */
export function computeEffectiveDirStates(entries: readonly CompareEntry[]): ReadonlyMap<string, CompareState> {
  const cached = effectiveDirStateCache.get(entries)
  if (cached) return cached

  const computed = computeEffectiveDirStatesUncached(entries)
  effectiveDirStateCache.set(entries, computed)
  return computed
}

function computeEffectiveDirStatesUncached(entries: readonly CompareEntry[]): ReadonlyMap<string, CompareState> {
  const entryByPath = new Map<string, CompareEntry>()
  const dirStates = new Map<string, Set<CompareState>>()

  for (const entry of entries) {
    entryByPath.set(entry.relativePath, entry)

    let ancestorPath = entry.relativePath
    let slashIdx = ancestorPath.lastIndexOf('/')
    while (slashIdx > 0) {
      ancestorPath = ancestorPath.slice(0, slashIdx)
      let stateSet = dirStates.get(ancestorPath)
      if (!stateSet) {
        stateSet = new Set()
        dirStates.set(ancestorPath, stateSet)
      }
      stateSet.add(entry.state)
      slashIdx = ancestorPath.lastIndexOf('/')
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
