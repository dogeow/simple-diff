import { matchesPathFilter } from '@shared/path-filter'
import type {
  CompareCacheEntry,
  CompareEntry,
  CompareFileFingerprint,
  CompareResult,
  CompareState,
  DiffReason,
  FileEntry,
  StrategyName,
} from '../../../shared/types'
import type { BrowserRegisteredRoot } from './browser-roots'

const QUICK_HASH_WINDOW_SIZE = 64 * 1024
const MTIME_TOLERANCE_MS = 2000

interface BrowserCompareOptions {
  readonly leftRoot: BrowserRegisteredRoot
  readonly rightRoot: BrowserRegisteredRoot
  readonly strategies: readonly StrategyName[]
  readonly extensionFilter?: readonly string[]
  readonly previousEntries?: readonly CompareCacheEntry[]
  readonly relativeRoots?: readonly string[]
  readonly signal?: AbortSignal
}

interface PendingDirectoryScan {
  readonly rel: string
  readonly entry?: CompareEntry
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('对比已取消')
  }
}

function normalizeRelativeRoot(relativeRoot: string): string {
  const trimmed = relativeRoot.trim()
  if (!trimmed || trimmed === '.' || trimmed === '/') {
    return ''
  }

  return trimmed.split(/[\\/]+/).filter(Boolean).join('/')
}

function normalizeRelativeRoots(relativeRoots: readonly string[] | undefined): readonly string[] {
  if (!relativeRoots || relativeRoots.length === 0) {
    return ['']
  }

  const normalized = new Set(relativeRoots.map(normalizeRelativeRoot))
  if (normalized.has('')) {
    return ['']
  }

  const sorted = Array.from(normalized).sort((left, right) => left.length - right.length || left.localeCompare(right))
  const minimized: string[] = []

  for (const candidate of sorted) {
    if (minimized.some((root) => candidate === root || candidate.startsWith(`${root}/`))) {
      continue
    }

    minimized.push(candidate)
  }

  return minimized.length > 0 ? minimized : ['']
}

function createReusableEntryMap(entries: readonly CompareCacheEntry[] | undefined): ReadonlyMap<string, CompareCacheEntry> {
  if (!entries || entries.length === 0) {
    return new Map()
  }

  return new Map(entries.map((entry) => [entry.relativePath, entry]))
}

function fileMetadataMatches(previous: CompareFileFingerprint, current: FileEntry): boolean {
  return previous.isDirectory === current.isDirectory
    && previous.size === current.size
    && previous.mtime === current.mtime
}

function getReusableEntry(
  relativePath: string,
  left: FileEntry,
  right: FileEntry,
  reusableEntries: ReadonlyMap<string, CompareCacheEntry>,
): CompareCacheEntry | undefined {
  const cached = reusableEntries.get(relativePath)
  if (!cached) return undefined
  if (!fileMetadataMatches(cached.left, left)) return undefined
  if (!fileMetadataMatches(cached.right, right)) return undefined
  return cached
}

function createPendingDirectoryScans(relativeRoots: readonly string[] | undefined): readonly PendingDirectoryScan[] {
  return normalizeRelativeRoots(relativeRoots).map((relativeRoot) => ({ rel: relativeRoot }))
}

function joinRelativePath(parentRelativePath: string, name: string): string {
  return parentRelativePath ? `${parentRelativePath}/${name}` : name
}

function compareByRelativePath(left: CompareEntry, right: CompareEntry): number {
  return left.relativePath.localeCompare(right.relativePath)
}

function matchLevel(
  leftList: readonly FileEntry[],
  rightList: readonly FileEntry[],
  parentRelative: string,
  pathFilters: readonly string[],
  reusableEntries: ReadonlyMap<string, CompareCacheEntry>,
): CompareEntry[] {
  const leftMap = new Map(leftList.map((entry) => [entry.name, entry]))
  const rightMap = new Map(rightList.map((entry) => [entry.name, entry]))
  const allNames = new Set([...leftMap.keys(), ...rightMap.keys()])
  const entries: CompareEntry[] = []

  for (const name of allNames) {
    const left = leftMap.get(name)
    const right = rightMap.get(name)
    const isDirectory = left?.isDirectory ?? right?.isDirectory ?? false
    const relativePath = joinRelativePath(parentRelative, name)

    if (matchesPathFilter(relativePath, pathFilters)) {
      continue
    }

    if (left && !right) {
      entries.push({ relativePath, name, isDirectory, state: 'left_only', left, reasons: [] })
      continue
    }

    if (!left && right) {
      entries.push({ relativePath, name, isDirectory, state: 'right_only', right, reasons: [] })
      continue
    }

    if (!left || !right) {
      continue
    }

    const reusableEntry = isDirectory ? undefined : getReusableEntry(relativePath, left, right, reusableEntries)
    if (reusableEntry) {
      entries.push({
        relativePath,
        name,
        isDirectory: false,
        state: reusableEntry.state,
        left,
        right,
        reasons: reusableEntry.reasons,
      })
      continue
    }

    entries.push({
      relativePath,
      name,
      isDirectory,
      state: 'pending',
      left,
      right,
      reasons: [],
    })
  }

  entries.sort((left, right) => {
    if (left.isDirectory !== right.isDirectory) {
      return left.isDirectory ? -1 : 1
    }

    return compareByRelativePath(left, right)
  })

  return entries
}

function incrementStats(stats: { total: number; equal: number; different: number; leftOnly: number; rightOnly: number }, state: CompareState): void {
  stats.total += 1
  if (state === 'equal') stats.equal += 1
  else if (state === 'different') stats.different += 1
  else if (state === 'left_only') stats.leftOnly += 1
  else if (state === 'right_only') stats.rightOnly += 1
}

async function digestBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-1', buffer)
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

async function hashFullFile(file: File): Promise<string> {
  return digestBlob(file)
}

async function hashFileRange(file: File, start: number, endInclusive: number): Promise<string> {
  return digestBlob(file.slice(start, endInclusive + 1))
}

async function buildQuickSignature(file: File): Promise<string> {
  if (file.size <= 0) {
    return 'empty'
  }

  if (file.size <= QUICK_HASH_WINDOW_SIZE * 2) {
    return hashFileRange(file, 0, file.size - 1)
  }

  const headEnd = QUICK_HASH_WINDOW_SIZE - 1
  const tailStart = file.size - QUICK_HASH_WINDOW_SIZE
  const [head, tail] = await Promise.all([
    hashFileRange(file, 0, headEnd),
    hashFileRange(file, tailStart, file.size - 1),
  ])

  return `${head}:${tail}`
}

async function compareFiles(
  leftRoot: BrowserRegisteredRoot,
  rightRoot: BrowserRegisteredRoot,
  entry: CompareEntry,
  strategies: readonly StrategyName[],
  signal?: AbortSignal,
): Promise<CompareEntry> {
  if (!entry.left || !entry.right) {
    return entry
  }

  const reasons: DiffReason[] = []

  let leftFile: File | null = null
  let rightFile: File | null = null

  for (const strategy of strategies) {
    throwIfAborted(signal)

    if (strategy === 'size') {
      if (entry.left.size !== entry.right.size) {
        reasons.push({ type: 'size', leftSize: entry.left.size, rightSize: entry.right.size })
      }
      continue
    }

    if (strategy === 'mtime') {
      if (Math.abs(entry.left.mtime - entry.right.mtime) > MTIME_TOLERANCE_MS) {
        reasons.push({ type: 'mtime', leftMtime: entry.left.mtime, rightMtime: entry.right.mtime })
      }
      continue
    }

    if (entry.left.size !== entry.right.size) {
      reasons.push({
        type: strategy,
        leftHash: `size:${entry.left.size}`,
        rightHash: `size:${entry.right.size}`,
      })
      continue
    }

    leftFile ??= await leftRoot.accessor.readFile(entry.relativePath)
    rightFile ??= await rightRoot.accessor.readFile(entry.relativePath)

    const [leftHash, rightHash] = strategy === 'hash'
      ? await Promise.all([hashFullFile(leftFile), hashFullFile(rightFile)])
      : await Promise.all([buildQuickSignature(leftFile), buildQuickSignature(rightFile)])

    if (leftHash !== rightHash) {
      reasons.push({
        type: strategy,
        leftHash,
        rightHash,
      })
    }
  }

  return {
    ...entry,
    state: reasons.length > 0 ? 'different' : 'equal',
    reasons,
  }
}

export async function compareBrowserDirectories(options: BrowserCompareOptions): Promise<CompareResult> {
  const startTime = Date.now()
  const stats = { total: 0, equal: 0, different: 0, leftOnly: 0, rightOnly: 0 }
  const pathFilters = options.extensionFilter ?? []
  const reusableEntries = createReusableEntryMap(options.previousEntries)
  const allEntries: CompareEntry[] = []

  let currentLevel = createPendingDirectoryScans(options.relativeRoots)

  while (currentLevel.length > 0) {
    const nextLevel: PendingDirectoryScan[] = []

    for (const scan of currentLevel) {
      throwIfAborted(options.signal)

      const leftList = await options.leftRoot.accessor.list(scan.rel)
      const rightList = await options.rightRoot.accessor.list(scan.rel)
      const matchedEntries = matchLevel(leftList, rightList, scan.rel, pathFilters, reusableEntries)

      if (scan.entry) {
        const resolvedDirectory: CompareEntry = { ...scan.entry, state: 'equal', reasons: [] }
        allEntries.push(resolvedDirectory)
        incrementStats(stats, resolvedDirectory.state)
      }

      for (const matchedEntry of matchedEntries) {
        throwIfAborted(options.signal)

        if (matchedEntry.isDirectory) {
          if (matchedEntry.state === 'pending') {
            nextLevel.push({
              rel: matchedEntry.relativePath,
              entry: matchedEntry,
            })
            continue
          }

          allEntries.push(matchedEntry)
          incrementStats(stats, matchedEntry.state)
          continue
        }

        if (matchedEntry.state === 'pending') {
          const comparedEntry = await compareFiles(options.leftRoot, options.rightRoot, matchedEntry, options.strategies, options.signal)
          allEntries.push(comparedEntry)
          incrementStats(stats, comparedEntry.state)
          continue
        }

        allEntries.push(matchedEntry)
        incrementStats(stats, matchedEntry.state)
      }
    }

    currentLevel = nextLevel
  }

  return {
    entries: allEntries,
    stats,
    duration: Date.now() - startTime,
  }
}