import type { FileEntry, CompareCacheEntry, CompareEntry, CompareFileFingerprint, CompareResult, CompareState, DiffReason, StrategyName } from '@shared/types'
import { joinSourcePath } from '@shared/source-path'
import { matchesPathFilter } from '@shared/path-filter'
import type { FileSource } from '../file-source/types'
import type { CompareContext, CompareStrategy } from './types'
import { HashStrategy } from './strategies/hash'
import { QuickHashStrategy } from './strategies/quick-hash'
import { SizeStrategy } from './strategies/size'
import { MtimeStrategy } from './strategies/mtime'
import { logger } from '../utils/logger'
import { formatDuration } from '@shared/format-duration'

const compareLogger = logger.child('compare')

const STRATEGY_MAP: Record<StrategyName, () => CompareStrategy> = {
  size: () => new SizeStrategy(),
  mtime: () => new MtimeStrategy(),
  hash: () => new HashStrategy(),
  quick_hash: () => new QuickHashStrategy(),
}

const DIRECTORY_SCAN_CONCURRENCY = 8
const SFTP_DIRECTORY_SCAN_CONCURRENCY = 2
const DIRECTORY_LOG_INTERVAL = 200
const DIRECTORY_SUMMARY_LOG_LIMIT = 20
const DIRECTORY_SUMMARY_LOG_INTERVAL = 200

interface PendingDirectoryScan {
  readonly rel: string
  readonly leftAbs: string
  readonly rightAbs: string
  readonly entry?: CompareEntry
}

type MutableCompareStats = {
  total: number
  equal: number
  different: number
  leftOnly: number
  rightOnly: number
}

export interface ComparatorOptions {
  readonly leftSource: FileSource
  readonly rightSource: FileSource
  readonly leftRoot: string
  readonly rightRoot: string
  readonly compareId?: string
  readonly strategies: readonly StrategyName[]
  readonly extensionFilter?: readonly string[]
  readonly previousEntries?: readonly CompareCacheEntry[]
  readonly retainEntries?: boolean
  readonly signal?: AbortSignal
  /** Called each time a new batch of entries is discovered (level by level). */
  readonly onEntriesFound?: (entries: readonly CompareEntry[]) => void
  readonly onEntryUpdate?: (entry: CompareEntry) => void
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('对比已取消')
  }
}

/**
 * Match left/right file lists for a single directory level and return CompareEntry[].
 */
function matchLevel(
  leftList: readonly FileEntry[],
  rightList: readonly FileEntry[],
  parentRelative: string,
  pathFilters: readonly string[],
  reusableEntries: ReadonlyMap<string, CompareCacheEntry>,
  onReusableEntry?: () => void,
): CompareEntry[] {
  const leftMap = new Map<string, FileEntry>()
  for (const entry of leftList) {
    leftMap.set(entry.name, entry)
  }

  const rightMap = new Map<string, FileEntry>()
  for (const entry of rightList) {
    rightMap.set(entry.name, entry)
  }

  const allNames = new Set([...leftMap.keys(), ...rightMap.keys()])
  const entries: CompareEntry[] = []

  for (const name of allNames) {
    const left = leftMap.get(name)
    const right = rightMap.get(name)
    const isDir = left?.isDirectory ?? right?.isDirectory ?? false
    const relativePath = parentRelative ? `${parentRelative}/${name}` : name

    if (matchesPathFilter(relativePath, pathFilters)) {
      continue
    }

    if (left && !right) {
      entries.push({ relativePath, name, isDirectory: isDir, state: 'left_only', left: { ...left, path: relativePath }, reasons: [] })
    } else if (!left && right) {
      entries.push({ relativePath, name, isDirectory: isDir, state: 'right_only', right: { ...right, path: relativePath }, reasons: [] })
    } else if (left && right) {
      const reusableEntry = isDir ? undefined : getReusableEntry(relativePath, left, right, reusableEntries)
      if (reusableEntry) {
        onReusableEntry?.()
        entries.push({
          relativePath,
          name,
          isDirectory: false,
          state: reusableEntry.state,
          left: { ...left, path: relativePath },
          right: { ...right, path: relativePath },
          reasons: reusableEntry.reasons,
        })
        continue
      }

      entries.push({
        relativePath, name, isDirectory: isDir, state: 'pending',
        left: { ...left, path: relativePath },
        right: { ...right, path: relativePath },
        reasons: [],
      })
    }
  }

  // Sort: directories first, then alphabetically
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.relativePath.localeCompare(b.relativePath)
  })

  return entries
}

function summarizeEntries(entries: readonly CompareEntry[]): string {
  const dirCount = entries.filter((entry) => entry.isDirectory).length
  const fileCount = entries.length - dirCount
  const pendingDirCount = entries.filter((entry) => entry.isDirectory && entry.state === 'pending').length
  const sample = entries.slice(0, 3).map((entry) => entry.relativePath).join('、')
  const more = entries.length > 3 ? '…' : ''
  const scanTail = pendingDirCount > 0 ? `，待继续扫描 ${pendingDirCount} 个目录` : ''

  return `发现 ${entries.length} 项（目录 ${dirCount}，文件 ${fileCount}${scanTail}）：${sample}${more}`
}

function createReusableEntryMap(entries: readonly CompareCacheEntry[] | undefined): ReadonlyMap<string, CompareCacheEntry> {
  if (!entries || entries.length === 0) return new Map()

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

function incrementStats(stats: MutableCompareStats, state: CompareState): void {
  stats.total++
  if (state === 'equal') stats.equal++
  else if (state === 'different') stats.different++
  else if (state === 'left_only') stats.leftOnly++
  else if (state === 'right_only') stats.rightOnly++
}

export async function compareDirectories(options: ComparatorOptions): Promise<CompareResult> {
  const {
    leftSource,
    rightSource,
    leftRoot,
    rightRoot,
    compareId,
    strategies,
    extensionFilter,
    previousEntries,
    retainEntries = true,
    onEntriesFound,
    onEntryUpdate,
    signal,
  } = options
  const startTime = Date.now()
  const logPrefix = compareId ? `[${compareId}] ` : ''

  const activeStrategies = strategies.map((name) => STRATEGY_MAP[name]())
  const directoryScanConcurrency = resolveDirectoryScanConcurrency(leftSource, rightSource)

  const pathFilters = extensionFilter ?? []
  const reusableEntries = createReusableEntryMap(previousEntries)

  const allEntries: CompareEntry[] = []
  const collectEntry = (entry: CompareEntry): void => {
    if (retainEntries) {
      allEntries.push(entry)
    }
  }
  const stats = { total: 0, equal: 0, different: 0, leftOnly: 0, rightOnly: 0 }
  let reusedEntryCount = 0
  let scannedDirCount = 0
  let directorySummaryLogCount = 0

  let currentLevel: readonly PendingDirectoryScan[] = [
    { rel: '', leftAbs: leftRoot, rightAbs: rightRoot },
  ]

  while (currentLevel.length > 0) {
    const nextLevel: PendingDirectoryScan[] = []

    await mapConcurrent(currentLevel, directoryScanConcurrency, async ({ rel, leftAbs, rightAbs, entry: directoryEntry }) => {
      throwIfAborted(signal)

      scannedDirCount++
      if (scannedDirCount === 1 || scannedDirCount % DIRECTORY_LOG_INTERVAL === 0) {
        compareLogger.info(`${logPrefix}正在扫描目录，已处理 ${scannedDirCount} 个目录`)
      }

      const dirLabel = rel || '.'

      if (directoryEntry) {
        onEntryUpdate?.({ ...directoryEntry, state: 'comparing', reasons: [] })
      }

      const failOnListError = rel === ''
      const heartbeatStarted = Date.now()
      const heartbeat = setInterval(() => {
        const seconds = Math.round((Date.now() - heartbeatStarted) / 1000)
        compareLogger.info(`${logPrefix}仍在等待目录列表: ${dirLabel}（已 ${seconds}s）`)
      }, 5000)
      let leftList: readonly FileEntry[] = []
      let rightList: readonly FileEntry[] = []
      try {
        ;[leftList, rightList] = await Promise.all([
          listSafe(leftSource, leftAbs, 'left', dirLabel, failOnListError),
          listSafe(rightSource, rightAbs, 'right', dirLabel, failOnListError),
        ])
      } finally {
        clearInterval(heartbeat)
      }

      const levelEntries = matchLevel(leftList, rightList, rel, pathFilters, reusableEntries, () => {
        reusedEntryCount += 1
      })

      if (directoryEntry) {
        const resolvedDirectory: CompareEntry = { ...directoryEntry, state: 'equal', reasons: [] }
        collectEntry(resolvedDirectory)
        incrementStats(stats, resolvedDirectory.state)
        onEntryUpdate?.(resolvedDirectory)
      }

      if (levelEntries.length === 0) return

      directorySummaryLogCount += 1
      if (directorySummaryLogCount <= DIRECTORY_SUMMARY_LOG_LIMIT || directorySummaryLogCount % DIRECTORY_SUMMARY_LOG_INTERVAL === 0) {
        compareLogger.info(`${logPrefix}目录 ${dirLabel} ${summarizeEntries(levelEntries)}`)
      }

      throwIfAborted(signal)
      onEntriesFound?.(levelEntries)

      for (const entry of levelEntries) {
        throwIfAborted(signal)

        if (entry.isDirectory) {
          if (entry.state === 'pending') {
            nextLevel.push({
              rel: entry.relativePath,
              leftAbs: joinPath(leftSource, leftAbs, entry.name),
              rightAbs: joinPath(rightSource, rightAbs, entry.name),
              entry,
            })
          } else {
            collectEntry(entry)
            incrementStats(stats, entry.state)
          }
          continue
        }

        if (entry.state === 'pending') {
          const reasons: DiffReason[] = []
          if (entry.left && entry.right) {
            const compareContext: CompareContext = {
              leftSource,
              rightSource,
              leftPath: joinPath(leftSource, leftAbs, entry.name),
              rightPath: joinPath(rightSource, rightAbs, entry.name),
            }

            for (const strategy of activeStrategies) {
              let reason: DiffReason | null
              try {
                reason = await strategy.compare(entry.left, entry.right, compareContext)
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                compareLogger.error(
                  `${logPrefix}文件对比失败: path=${entry.relativePath} strategy=${strategy.name} left=${compareContext.leftPath} right=${compareContext.rightPath} error=${message}`,
                )
                throw new Error(`比较文件 ${entry.relativePath} 时，策略 ${strategy.name} 失败: ${message}`)
              }
              if (reason) reasons.push(reason)
            }
          }

          const state = reasons.length > 0 ? 'different' : 'equal'
          const resolved: CompareEntry = { ...entry, state, reasons }
          collectEntry(resolved)
          incrementStats(stats, state)
          onEntryUpdate?.(resolved)
        } else {
          collectEntry(entry)
          incrementStats(stats, entry.state)
        }
      }
    })

    currentLevel = nextLevel
  }

  const duration = Date.now() - startTime
  if (reusableEntries.size > 0) {
    compareLogger.info(`${logPrefix}复用历史对比结果 ${reusedEntryCount}/${reusableEntries.size} 个文件`)
  }
  compareLogger.info(`${logPrefix}对比完成，耗时 ${formatDuration(duration)} — 共 ${stats.total} 项`)
  return { entries: allEntries, entriesIncluded: retainEntries, stats, duration }
}

function resolveDirectoryScanConcurrency(leftSource: FileSource, rightSource: FileSource): number {
  if (leftSource.type === 'sftp' || rightSource.type === 'sftp') {
    return SFTP_DIRECTORY_SCAN_CONCURRENCY
  }

  return DIRECTORY_SCAN_CONCURRENCY
}

async function mapConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return

  let nextIndex = 0
  const workerCount = Math.min(concurrency, items.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++
      await worker(items[currentIndex], currentIndex)
    }
  }))
}

/** Safely list a directory, optionally failing fast on critical errors. */
async function listSafe(
  source: FileSource,
  dirPath: string,
  side: string,
  label: string,
  failOnError = false,
): Promise<readonly FileEntry[]> {
  try {
    return await source.list(dirPath)
  } catch (err) {
    const message = `[${side}] 无法列出目录 ${label}: ${err instanceof Error ? err.message : err}`
    compareLogger.warn(message)
    if (failOnError) {
      throw new Error(message)
    }
    return []
  }
}

/** Join path using posix for SFTP or native for local. */
function joinPath(source: FileSource, base: string, child: string): string {
  return joinSourcePath(source.type, base, child)
}
