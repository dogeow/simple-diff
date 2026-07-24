import type { CompareEntry } from '../../../../shared/types'
import { adjustCompareEntrySummary } from './entry-summary'
import type { CompareEntrySummary } from './types'
import { normalizeDirtyPath } from './dirty-paths'

export function upsertEntries(
  existing: readonly CompareEntry[],
  incoming: readonly CompareEntry[],
): CompareEntry[] {
  if (incoming.length === 0) return [...existing]

  const next = [...existing]
  const indexByPath = new Map(existing.map((entry, index) => [entry.relativePath, index]))

  for (const entry of incoming) {
    const existingIndex = indexByPath.get(entry.relativePath)
    if (existingIndex == null) {
      indexByPath.set(entry.relativePath, next.length)
      next.push(entry)
      continue
    }
    next[existingIndex] = entry
  }

  return next
}

// Persistent path→index cache for the hot IPC upsert path.
let cachedIndexEntriesRef: readonly CompareEntry[] | null = null
let cachedEntryIndex = new Map<string, number>()

function getOrRebuildEntryIndex(entries: readonly CompareEntry[]): Map<string, number> {
  if (cachedIndexEntriesRef === entries) {
    return cachedEntryIndex
  }
  cachedEntryIndex = new Map()
  for (let i = 0; i < entries.length; i += 1) {
    cachedEntryIndex.set(entries[i].relativePath, i)
  }
  cachedIndexEntriesRef = entries
  return cachedEntryIndex
}

export function upsertEntriesWithSummary(
  existing: readonly CompareEntry[],
  incoming: readonly CompareEntry[],
  currentSummary: CompareEntrySummary,
): { readonly entries: readonly CompareEntry[]; readonly entrySummary: CompareEntrySummary } {
  if (incoming.length === 0) {
    return {
      entries: existing,
      entrySummary: currentSummary,
    }
  }

  const next = [...existing]
  const indexByPath = getOrRebuildEntryIndex(existing)
  let nextSummary = currentSummary

  for (const entry of incoming) {
    const existingIndex = indexByPath.get(entry.relativePath)
    if (existingIndex == null) {
      indexByPath.set(entry.relativePath, next.length)
      next.push(entry)
      nextSummary = adjustCompareEntrySummary(nextSummary, entry, 1)
      continue
    }

    const previousEntry = next[existingIndex]
    next[existingIndex] = entry
    nextSummary = adjustCompareEntrySummary(nextSummary, previousEntry, -1)
    nextSummary = adjustCompareEntrySummary(nextSummary, entry, 1)
  }

  cachedIndexEntriesRef = next
  return {
    entries: next,
    entrySummary: nextSummary,
  }
}

export function isDirectChildPath(parentRelative: string, candidatePath: string): boolean {
  if (parentRelative === '') {
    return candidatePath !== '' && !candidatePath.includes('/')
  }

  if (!candidatePath.startsWith(`${parentRelative}/`)) return false
  return !candidatePath.slice(parentRelative.length + 1).includes('/')
}

export function replaceDirectoryChildren(
  existing: readonly CompareEntry[],
  parentRelative: string,
  incomingChildren: readonly CompareEntry[],
): CompareEntry[] {
  const nextChildrenByPath = new Map(incomingChildren.map((entry) => [entry.relativePath, entry]))
  const removedChildRoots = existing
    .filter((entry) => isDirectChildPath(parentRelative, entry.relativePath))
    .map((entry) => entry.relativePath)
    .filter((relativePath) => !nextChildrenByPath.has(relativePath))

  const preserved = existing.filter((entry) => {
    return !removedChildRoots.some((removedPath) => (
      entry.relativePath === removedPath || entry.relativePath.startsWith(`${removedPath}/`)
    ))
  })

  return upsertEntries(preserved, incomingChildren)
}

export function replaceEntriesForRoots(
  existing: readonly CompareEntry[],
  roots: readonly string[],
  incomingEntries: readonly CompareEntry[],
): readonly CompareEntry[] {
  const normalizedRoots = roots.map(normalizeDirtyPath)
  if (normalizedRoots.length === 0) {
    return existing
  }

  if (normalizedRoots.includes('')) {
    return upsertEntries([], incomingEntries)
  }

  const preservedEntries = existing.filter((entry) => {
    return !normalizedRoots.some((root) => entry.relativePath.startsWith(`${root}/`))
  })

  return upsertEntries(preservedEntries, incomingEntries)
}

export function cloneEntries(entries: readonly CompareEntry[]): readonly CompareEntry[] {
  return [...entries]
}
