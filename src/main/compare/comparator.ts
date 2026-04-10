import type { FileEntry, CompareEntry, CompareResult, CompareStats, DiffReason, StrategyName } from '@shared/types'
import type { FileSource } from '../file-source/types'
import type { CompareContext, CompareStrategy } from './types'
import { HashStrategy } from './strategies/hash'
import { QuickHashStrategy } from './strategies/quick-hash'
import { SizeStrategy } from './strategies/size'
import { MtimeStrategy } from './strategies/mtime'
import { logger } from '../utils/logger'

const STRATEGY_MAP: Record<StrategyName, () => CompareStrategy> = {
  size: () => new SizeStrategy(),
  mtime: () => new MtimeStrategy(),
  hash: () => new HashStrategy(),
  quick_hash: () => new QuickHashStrategy(),
}

export interface ComparatorOptions {
  readonly leftSource: FileSource
  readonly rightSource: FileSource
  readonly leftRoot: string
  readonly rightRoot: string
  readonly strategies: readonly StrategyName[]
  readonly extensionFilter?: readonly string[]
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

function normalizeFilterValue(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, '').toLowerCase()
}

function matchesPathFilter(relativePath: string, filters: readonly string[]): boolean {
  const normalizedPath = normalizeFilterValue(relativePath)
  if (!normalizedPath) return false

  const segments = normalizedPath.split('/')

  return filters.some((filter) => {
    const normalizedFilter = normalizeFilterValue(filter)
    if (!normalizedFilter) return false

    if (normalizedFilter.includes('/')) {
      return normalizedPath === normalizedFilter || normalizedPath.startsWith(`${normalizedFilter}/`)
    }

    return segments.includes(normalizedFilter)
  })
}

/**
 * Match left/right file lists for a single directory level and return CompareEntry[].
 */
function matchLevel(
  leftList: readonly FileEntry[],
  rightList: readonly FileEntry[],
  parentRelative: string,
  pathFilters: readonly string[],
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
      if (isDir) {
        logger.info(`跳过已过滤目录: ${relativePath}`)
      }
      continue
    }

    if (left && !right) {
      entries.push({ relativePath, name, isDirectory: isDir, state: 'left_only', left: { ...left, path: relativePath }, reasons: [] })
    } else if (!left && right) {
      entries.push({ relativePath, name, isDirectory: isDir, state: 'right_only', right: { ...right, path: relativePath }, reasons: [] })
    } else if (left && right) {
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

export async function compareDirectories(options: ComparatorOptions): Promise<CompareResult> {
  const {
    leftSource,
    rightSource,
    leftRoot,
    rightRoot,
    strategies,
    extensionFilter,
    onEntriesFound,
    onEntryUpdate,
    signal,
  } = options
  const startTime = Date.now()

  const activeStrategies = strategies.map((name) => STRATEGY_MAP[name]())

  const pathFilters = extensionFilter ?? []

  const allEntries: CompareEntry[] = []
  const stats: CompareStats = { total: 0, equal: 0, different: 0, leftOnly: 0, rightOnly: 0 }

  // BFS queue: each item is { relative path prefix, left absolute, right absolute }
  const queue: { rel: string; leftAbs: string; rightAbs: string }[] = [
    { rel: '', leftAbs: leftRoot, rightAbs: rightRoot },
  ]

  while (queue.length > 0) {
    throwIfAborted(signal)

    const { rel, leftAbs, rightAbs } = queue.shift()!
    const dirLabel = rel || '.'
    logger.info(`扫描层级: ${dirLabel}`)

    // List both sides in parallel
    const [leftList, rightList] = await Promise.all([
      listSafe(leftSource, leftAbs, 'left', dirLabel),
      listSafe(rightSource, rightAbs, 'right', dirLabel),
    ])

    const levelEntries = matchLevel(leftList, rightList, rel, pathFilters)
    if (levelEntries.length === 0) continue

    // Emit this batch so renderer can display immediately
    throwIfAborted(signal)
    onEntriesFound?.(levelEntries)

    // Compare files and queue shared directories
    for (const entry of levelEntries) {
      throwIfAborted(signal)

      if (entry.isDirectory) {
        if (entry.state === 'pending') {
          // Both sides have this dir — queue for deeper scan
          const childRel = entry.relativePath
          queue.push({
            rel: childRel,
            leftAbs: joinPath(leftSource, leftAbs, entry.name),
            rightAbs: joinPath(rightSource, rightAbs, entry.name),
          })
          // Mark directory as equal (structure match)
          const resolved: CompareEntry = { ...entry, state: 'equal', reasons: [] }
          allEntries.push(resolved)
          stats.total++
          stats.equal++
          onEntryUpdate?.(resolved)
        } else {
          // One-side-only directory — do NOT recurse
          allEntries.push(entry)
          stats.total++
          if (entry.state === 'left_only') stats.leftOnly++
          else if (entry.state === 'right_only') stats.rightOnly++
        }
      } else {
        // File — compare immediately
        if (entry.state === 'pending') {
          throwIfAborted(signal)
          onEntryUpdate?.({ ...entry, state: 'comparing' })

          const reasons: DiffReason[] = []
          if (entry.left && entry.right) {
            const compareContext: CompareContext = {
              leftSource,
              rightSource,
              leftPath: joinPath(leftSource, leftAbs, entry.name),
              rightPath: joinPath(rightSource, rightAbs, entry.name),
            }

            for (const strategy of activeStrategies) {
              const reason = await strategy.compare(entry.left, entry.right, compareContext)
              if (reason) reasons.push(reason)
            }
          }

          const state = reasons.length > 0 ? 'different' : 'equal'
          const resolved: CompareEntry = { ...entry, state, reasons }
          allEntries.push(resolved)
          stats.total++
          if (state === 'equal') stats.equal++
          else stats.different++
          onEntryUpdate?.(resolved)
        } else {
          allEntries.push(entry)
          stats.total++
          if (entry.state === 'left_only') stats.leftOnly++
          else if (entry.state === 'right_only') stats.rightOnly++
        }
      }
    }
  }

  const duration = Date.now() - startTime
  logger.info(`对比完成，耗时 ${duration}ms — 共 ${stats.total} 项`)
  return { entries: allEntries, stats, duration }
}

/** Safely list a directory, returning [] on error. */
async function listSafe(source: FileSource, dirPath: string, side: string, label: string): Promise<readonly FileEntry[]> {
  try {
    return await source.list(dirPath)
  } catch (err) {
    logger.warn(`[${side}] 无法列出目录 ${label}: ${err instanceof Error ? err.message : err}`)
    return []
  }
}

/** Join path using posix for SFTP or native for local. */
function joinPath(source: FileSource, base: string, child: string): string {
  if (source.type === 'sftp') {
    return base.endsWith('/') ? `${base}${child}` : `${base}/${child}`
  }
  // Local — use platform-aware join
  const { join } = require('path')
  return join(base, child)
}
