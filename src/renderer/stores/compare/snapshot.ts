import type { CompareEntry, CompareResult, SourceConfig } from '../../../../shared/types'
import { cloneDirtyPaths } from './dirty-paths'
import { cloneEntries, upsertEntries } from './entry-ops'
import type { CompareSessionSnapshot, CompareStore } from './types'

export const MAX_COMPARE_TAB_SNAPSHOT_ENTRIES = 5000

/**
 * 结构上兼容快照和 live store，所以“对比标签有没有内容”与“工作区是 setup 还是
 * result”是同一个判断，不会分叉（蓝图 chunk 5 第 2 条：没有新增持久化字段）。
 */
export type CompareSessionContentSource = Pick<
  CompareSessionSnapshot,
  'leftSource' | 'rightSource' | 'entries' | 'scanning' | 'comparing' | 'paused' | 'done' | 'error'
>

export function hasCompareSessionContent(snapshot: CompareSessionContentSource): boolean {
  return Boolean(
    snapshot.leftSource
    || snapshot.rightSource
    || snapshot.entries.length > 0
    || snapshot.scanning
    || snapshot.comparing
    || snapshot.paused
    || snapshot.done
    || snapshot.error,
  )
}

function hasUnresolvedCompareEntries(entries: readonly CompareEntry[]): boolean {
  return entries.some((entry) => entry.state === 'pending' || entry.state === 'comparing')
}

export function clearInactiveIncompleteSnapshot(snapshot: CompareSessionSnapshot): CompareSessionSnapshot {
  if (snapshot.done || snapshot.scanning || snapshot.comparing || snapshot.paused || snapshot.activeCompareId) {
    return snapshot
  }

  if (!hasUnresolvedCompareEntries(snapshot.entries)) {
    return snapshot
  }

  return {
    ...snapshot,
    entries: [],
    duration: 0,
    loadingDirs: [],
    expandedDirs: [],
  }
}

export function sanitizePersistedCompareSessionSnapshot(snapshot: CompareSessionSnapshot): CompareSessionSnapshot {
  const sanitizedSnapshot = {
    ...snapshot,
    scanning: false,
    comparing: false,
    dirtyPaths: [],
    loadingDirs: [],
    activeCompareId: null,
    compareSessionId: null,
  }

  const inactiveSnapshot = clearInactiveIncompleteSnapshot(sanitizedSnapshot)
  if (inactiveSnapshot.entries.length <= MAX_COMPARE_TAB_SNAPSHOT_ENTRIES) {
    return inactiveSnapshot
  }

  return {
    ...inactiveSnapshot,
    entries: [],
    loadingDirs: [],
    expandedDirs: [],
    done: false,
    duration: 0,
  }
}

export function createLightweightCompareSessionSnapshot(snapshot: CompareSessionSnapshot): CompareSessionSnapshot {
  return {
    ...snapshot,
    entries: [],
    loadingDirs: [],
    expandedDirs: [],
  }
}

export function applyScanEntriesToSnapshot(
  snapshot: CompareSessionSnapshot,
  compareId: string,
  entries: readonly CompareEntry[],
): CompareSessionSnapshot {
  if (snapshot.activeCompareId !== compareId) return snapshot

  if (snapshot.paused) {
    return {
      ...snapshot,
      entries: upsertEntries(snapshot.entries, entries),
      done: false,
      error: null,
    }
  }

  return {
    ...snapshot,
    entries: upsertEntries(snapshot.entries, entries),
    compareSessionId: compareId,
    scanning: true,
    comparing: true,
    paused: false,
    done: false,
    error: null,
  }
}

export function applyEntryUpdatesToSnapshot(
  snapshot: CompareSessionSnapshot,
  compareId: string,
  entries: readonly CompareEntry[],
): CompareSessionSnapshot {
  if (snapshot.activeCompareId !== compareId) return snapshot
  if (entries.length === 0) return snapshot

  if (snapshot.paused) {
    return {
      ...snapshot,
      entries: upsertEntries(snapshot.entries, entries),
      done: false,
      error: null,
    }
  }

  return {
    ...snapshot,
    entries: upsertEntries(snapshot.entries, entries),
    compareSessionId: compareId,
    scanning: true,
    comparing: true,
    paused: false,
    done: false,
    error: null,
  }
}

export function applyPauseCompareToSnapshot(
  snapshot: CompareSessionSnapshot,
  compareId: string,
): CompareSessionSnapshot {
  if (snapshot.activeCompareId !== compareId) return snapshot

  return {
    ...snapshot,
    scanning: false,
    comparing: false,
    paused: true,
    done: false,
    error: null,
    loadingDirs: [],
    activeCompareId: compareId,
    compareSessionId: compareId,
  }
}

export function applyPausedCompareErrorToSnapshot(
  snapshot: CompareSessionSnapshot,
  compareId: string,
  error: string | null,
): CompareSessionSnapshot {
  if (!snapshot.paused) return snapshot
  if (snapshot.activeCompareId && snapshot.activeCompareId !== compareId) return snapshot

  return {
    ...snapshot,
    paused: false,
    error,
    activeCompareId: null,
    compareSessionId: null,
  }
}

export function applyFinishCompareToSnapshot(
  snapshot: CompareSessionSnapshot,
  compareId: string,
  result: CompareResult,
): CompareSessionSnapshot {
  if (snapshot.activeCompareId !== compareId) return snapshot

  const nextEntries = result.entriesIncluded === false
    ? snapshot.entries
    : upsertEntries([], result.entries)

  return {
    ...snapshot,
    entries: nextEntries,
    scanning: false,
    comparing: false,
    paused: false,
    done: true,
    error: null,
    duration: result.duration,
    loadingDirs: [],
    activeCompareId: null,
    compareSessionId: compareId,
  }
}

export function applyCompareErrorToSnapshot(
  snapshot: CompareSessionSnapshot,
  compareId: string,
  error: string | null,
): CompareSessionSnapshot {
  if (snapshot.activeCompareId !== compareId) return snapshot

  return {
    ...snapshot,
    scanning: false,
    comparing: false,
    paused: false,
    error,
    loadingDirs: [],
    activeCompareId: null,
    compareSessionId: null,
  }
}

export function deriveSourceState(source: SourceConfig): {
  sourceType: 'local' | 'sftp'
  path: string
  sshConfigId: string
} {
  if (source.type === 'sftp') {
    return {
      sourceType: 'sftp',
      path: source.path,
      sshConfigId: source.configId,
    }
  }

  return {
    sourceType: 'local',
    path: source.path,
    sshConfigId: '',
  }
}

export function createCompareSessionSnapshot(
  state: CompareStore,
  options: { readonly includeEntries: boolean } = { includeEntries: true },
): CompareSessionSnapshot {
  return {
    leftPath: state.leftPath,
    rightPath: state.rightPath,
    leftSourceType: state.leftSourceType,
    rightSourceType: state.rightSourceType,
    leftSSHConfigId: state.leftSSHConfigId,
    rightSSHConfigId: state.rightSSHConfigId,
    strategies: [...state.strategies],
    extensionFilter: [...state.extensionFilter],
    hideDot: state.hideDot,
    hideDotFilter: state.hideDotFilter,
    entries: options.includeEntries ? cloneEntries(state.entries) : [],
    scanning: state.scanning,
    comparing: state.comparing,
    paused: state.paused,
    done: state.done,
    error: state.error,
    duration: state.duration,
    leftSource: state.leftSource,
    rightSource: state.rightSource,
    dirtyPaths: cloneDirtyPaths(state.dirtyPaths),
    loadingDirs: options.includeEntries ? [...state.loadingDirs] : [],
    filter: state.filter,
    expandedDirs: options.includeEntries ? [...state.expandedDirs] : [],
    viewMode: state.viewMode,
    activeCompareId: state.activeCompareId,
    compareSessionId: state.compareSessionId,
  }
}
