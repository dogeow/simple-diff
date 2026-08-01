import type { CompareEntry, CompareStats } from '../../../../shared/types'
import type { CompareEntrySummary } from './types'

export function computeStats(entries: readonly CompareEntry[]): CompareStats {
  let equal = 0, different = 0, leftOnly = 0, rightOnly = 0
  for (const e of entries) {
    if (e.state === 'equal') equal++
    else if (e.state === 'different') different++
    else if (e.state === 'left_only') leftOnly++
    else if (e.state === 'right_only') rightOnly++
  }
  return { total: entries.length, equal, different, leftOnly, rightOnly }
}

export function createEmptyCompareEntrySummary(): CompareEntrySummary {
  return {
    stats: {
      total: 0,
      equal: 0,
      different: 0,
      leftOnly: 0,
      rightOnly: 0,
    },
    pendingCount: 0,
    allDirCount: 0,
  }
}

export function adjustCompareEntrySummary(
  summary: CompareEntrySummary,
  entry: CompareEntry,
  factor: 1 | -1,
): CompareEntrySummary {
  const stats = summary.stats
  const nextStats = {
    total: stats.total + factor,
    equal: stats.equal + (entry.state === 'equal' ? factor : 0),
    different: stats.different + (entry.state === 'different' ? factor : 0),
    leftOnly: stats.leftOnly + (entry.state === 'left_only' ? factor : 0),
    rightOnly: stats.rightOnly + (entry.state === 'right_only' ? factor : 0),
  }

  return {
    stats: nextStats,
    pendingCount: summary.pendingCount
      + (entry.state === 'pending' || entry.state === 'comparing' ? factor : 0),
    allDirCount: summary.allDirCount + (entry.isDirectory ? factor : 0),
  }
}

export function summarizeCompareEntries(entries: readonly CompareEntry[]): CompareEntrySummary {
  // Single-pass mutable accumulator — avoid one object per entry on large trees.
  let equal = 0
  let different = 0
  let leftOnly = 0
  let rightOnly = 0
  let pendingCount = 0
  let allDirCount = 0

  for (const entry of entries) {
    switch (entry.state) {
      case 'equal':
        equal += 1
        break
      case 'different':
        different += 1
        break
      case 'left_only':
        leftOnly += 1
        break
      case 'right_only':
        rightOnly += 1
        break
      case 'pending':
      case 'comparing':
        pendingCount += 1
        break
    }
    if (entry.isDirectory) {
      allDirCount += 1
    }
  }

  return {
    stats: {
      total: entries.length,
      equal,
      different,
      leftOnly,
      rightOnly,
    },
    pendingCount,
    allDirCount,
  }
}
