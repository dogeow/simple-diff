import type { CompareEntry, SourceConfig, StartSyncRequest } from '@shared/types'
import { normalizeRelativePath } from '@shared/source-path'

export interface ActiveCompare {
  readonly compareId: string
  leftSource: SourceConfig
  rightSource: SourceConfig
  controller: AbortController | null
  leftToRightEntries: Map<string, { readonly isDirectory: boolean, readonly state: CompareEntry['state'] }>
  rightToLeftEntries: Map<string, { readonly isDirectory: boolean, readonly state: CompareEntry['state'] }>
  updatedAt: number
}

const MAX_ACTIVE_COMPARER_ENTRIES_BY_SENDER = 32

const activeCompares = new WeakMap<object, Map<string, ActiveCompare>>()

function getActiveCompareMap(sender: object): Map<string, ActiveCompare> {
  let compares = activeCompares.get(sender)
  if (!compares) {
    compares = new Map<string, ActiveCompare>()
    activeCompares.set(sender, compares)
  }
  return compares
}

function pruneActiveCompares(sender: object): void {
  const compares = activeCompares.get(sender)
  if (!compares || compares.size <= MAX_ACTIVE_COMPARER_ENTRIES_BY_SENDER) return

  const entries = Array.from(compares.entries())
    .filter(([, compare]) => compare.controller == null)
    .sort((a, b) => a[1].updatedAt - b[1].updatedAt)

  for (const [compareId] of entries) {
    if (compares.size <= MAX_ACTIVE_COMPARER_ENTRIES_BY_SENDER) break
    compares.delete(compareId)
  }
}

export function setActiveCompare(sender: object, compare: Omit<ActiveCompare, 'updatedAt'>): void {
  const compares = getActiveCompareMap(sender)
  compares.set(compare.compareId, {
    ...compare,
    updatedAt: Date.now(),
  })

  pruneActiveCompares(sender)
}

export function updateCompareSession(sender: object, compareId: string, entries: readonly CompareEntry[]): void {
  const compare = getActiveCompare(sender, compareId)
  if (!compare) return

  for (const entry of entries) {
    let normalizedPath: string

    try {
      normalizedPath = normalizeRelativePath(entry.relativePath, '/')
    } catch {
      continue
    }

    if (entry.state === 'left_only') {
      compare.leftToRightEntries.set(normalizedPath, {
        isDirectory: entry.isDirectory,
        state: entry.state,
      })
      compare.rightToLeftEntries.delete(normalizedPath)
      continue
    }

    if (entry.state === 'right_only') {
      compare.rightToLeftEntries.set(normalizedPath, {
        isDirectory: entry.isDirectory,
        state: entry.state,
      })
      compare.leftToRightEntries.delete(normalizedPath)
      continue
    }

    compare.leftToRightEntries.delete(normalizedPath)
    compare.rightToLeftEntries.delete(normalizedPath)
  }

  compare.updatedAt = Date.now()
}

function isSourceConfigSame(left: SourceConfig, right: SourceConfig): boolean {
  if (left.type !== right.type) {
    return false
  }

  if (left.path !== right.path) {
    return false
  }

  return left.type !== 'sftp' || left.configId === right.configId
}

export function assertSyncStartRequestEntries(
  sender: object,
  request: StartSyncRequest,
): readonly CompareEntry[] {
  const compare = getActiveCompare(sender, request.compareId)
  if (!compare) {
    throw new Error('未找到匹配的对比会话')
  }

  if (!isSourceConfigSame(compare.leftSource, request.leftSource)
    || !isSourceConfigSame(compare.rightSource, request.rightSource)) {
    throw new Error('当前对比会话与同步参数不一致')
  }

  const expectedState: CompareEntry['state'] = request.direction === 'left_to_right' ? 'left_only' : 'right_only'
  const allowedEntries = request.direction === 'left_to_right'
    ? compare.leftToRightEntries
    : compare.rightToLeftEntries

  const sanitizedEntries: CompareEntry[] = []

  for (const entry of request.entries) {
    const normalizedPath = normalizeRelativePath(entry.relativePath, '/')
    const expected = allowedEntries.get(normalizedPath)

    if (!expected || expected.state !== expectedState || expected.isDirectory !== entry.isDirectory) {
      throw new Error('同步条目不在受信任范围')
    }

    if (entry.relativePath === normalizedPath) {
      sanitizedEntries.push(entry)
    } else {
      sanitizedEntries.push({ ...entry, relativePath: normalizedPath })
    }
  }

  return sanitizedEntries
}

export function getActiveCompare(sender: object, compareId: string): ActiveCompare | null {
  return activeCompares.get(sender)?.get(compareId) ?? null
}

export function clearActiveCompare(sender: object, compareId: string, controller: AbortController): void {
  const compares = activeCompares.get(sender)
  const activeCompare = compares?.get(compareId)
  if (activeCompare?.controller === controller) {
    activeCompare.controller = null
  }
  if (!compares) return

  if (compares.size > MAX_ACTIVE_COMPARER_ENTRIES_BY_SENDER) {
    pruneActiveCompares(sender)
  }
  if (compares.size === 0) {
    activeCompares.delete(sender)
  }
}

export function cancelActiveCompare(sender: object, compareId?: string): void {
  const compares = activeCompares.get(sender)
  if (!compares) return

  if (compareId) {
    const compare = compares.get(compareId)
    compare?.controller?.abort()
    return
  }

  for (const compare of compares.values()) {
    compare.controller?.abort()
  }
}
