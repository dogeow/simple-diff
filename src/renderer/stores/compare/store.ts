import { create } from 'zustand'
import {
  buildDirtyDisplayPaths,
  clearDirtyPathSet,
  mergeDirtyPathSet,
} from './dirty-paths'
import { loadDirectoryChildren } from './directory-load'
import {
  isDirectChildPath,
  replaceDirectoryChildren,
  replaceEntriesForRoots,
  upsertEntries,
  upsertEntriesWithSummary,
} from './entry-ops'
import { summarizeCompareEntries } from './entry-summary'
import { compareInitial, initialState } from './initial-state'
import {
  clearInactiveIncompleteSnapshot,
  createCompareSessionSnapshot,
  deriveSourceState,
  MAX_COMPARE_TAB_SNAPSHOT_ENTRIES,
} from './snapshot'
import type { CompareStore, CompareStoreStateUpdate } from './types'

const compareStore = create<CompareStore>((set, get) => ({
  ...initialState,

  setLeftPath: (leftPath) => set({ leftPath }),
  setRightPath: (rightPath) => set({ rightPath }),
  setLeftSourceType: (leftSourceType) => set({ leftSourceType }),
  setRightSourceType: (rightSourceType) => set({ rightSourceType }),
  setLeftSSHConfigId: (leftSSHConfigId) => set({ leftSSHConfigId }),
  setRightSSHConfigId: (rightSSHConfigId) => set({ rightSSHConfigId }),
  setStrategies: (strategies) => set({ strategies }),
  setExtensionFilter: (extensionFilter) => set({ extensionFilter }),
  setHideDot: (hideDot) => set({ hideDot }),
  setHideDotFilter: (hideDotFilter) => set({ hideDotFilter }),

  startScanning: (activeCompareId, options) => set((state) => ({
    ...compareInitial,
    entries: options?.preserveEntries ? state.entries : compareInitial.entries,
    entrySummary: options?.preserveEntries ? state.entrySummary : compareInitial.entrySummary,
    expandedDirs: options?.preserveEntries ? state.expandedDirs : compareInitial.expandedDirs,
    filter: options?.preserveEntries ? state.filter : compareInitial.filter,
    viewMode: options?.preserveEntries ? state.viewMode : compareInitial.viewMode,
    leftSource: options?.preserveEntries ? state.leftSource : compareInitial.leftSource,
    rightSource: options?.preserveEntries ? state.rightSource : compareInitial.rightSource,
    activeCompareId,
    compareSessionId: activeCompareId,
    scanning: true,
    paused: false,
    compareVersion: state.compareVersion + 1,
  })),

  setScanEntries: (compareId, newEntries) => {
    if (get().activeCompareId !== compareId) return
    set((state) => {
      const next = upsertEntriesWithSummary(state.entries, newEntries, state.entrySummary)

      if (state.paused) {
        return {
          entries: next.entries,
          entrySummary: next.entrySummary,
          done: false,
          error: null,
        }
      }

      return {
        entries: next.entries,
        entrySummary: next.entrySummary,
        scanning: true,
        comparing: true,
        paused: false,
        dirtyPaths: compareInitial.dirtyPaths,
        dirtyDisplayPaths: compareInitial.dirtyDisplayPaths,
      }
    })
  },

  updateEntries: (compareId, entries) => {
    if (get().activeCompareId !== compareId) return
    if (entries.length === 0) return
    set((state) => {
      const next = upsertEntriesWithSummary(state.entries, entries, state.entrySummary)

      if (state.paused) {
        return {
          entries: next.entries,
          entrySummary: next.entrySummary,
          done: false,
          error: null,
        }
      }

      return {
        entries: next.entries,
        entrySummary: next.entrySummary,
        paused: false,
      }
    })
  },

  finishCompare: (compareId, result) => {
    if (get().activeCompareId !== compareId) return
    set((state) => {
      const nextEntries = result.entriesIncluded === false
        ? state.entries
        : upsertEntries([], result.entries)
      const nextSummary = result.entriesIncluded === false
        ? state.entrySummary
        : summarizeCompareEntries(nextEntries)

      return {
        entries: nextEntries,
        entrySummary: nextSummary,
        scanning: false,
        comparing: false,
        paused: false,
        done: true,
        error: null,
        duration: result.duration,
        dirtyPaths: compareInitial.dirtyPaths,
        dirtyDisplayPaths: compareInitial.dirtyDisplayPaths,
        loadingDirs: new Set(),
        activeCompareId: null,
        compareSessionId: compareId,
      }
    })
  },

  applyPartialCompareResult: (roots, incomingEntries) => {
    set((state) => {
      const entries = replaceEntriesForRoots(state.entries, roots, incomingEntries)
      const clearedDirtyPaths = clearDirtyPathSet(state.dirtyPaths, roots)

      return {
        entries,
        entrySummary: summarizeCompareEntries(entries),
        dirtyPaths: clearedDirtyPaths.dirtyPaths,
        dirtyDisplayPaths: clearedDirtyPaths.dirtyDisplayPaths,
        error: null,
        done: true,
      }
    })
  },

  pauseCompare: (compareId) => {
    if (compareId && get().activeCompareId !== compareId) return
    set({
      scanning: false,
      comparing: false,
      paused: true,
      done: false,
      error: null,
      loadingDirs: new Set(),
      activeCompareId: compareId ?? get().activeCompareId,
    })
  },

  removeEntry: (relativePath) => {
    const entries = get().entries.filter((e) =>
      e.relativePath !== relativePath && !e.relativePath.startsWith(relativePath + '/'),
    )
    set({ entries, entrySummary: summarizeCompareEntries(entries) })
  },

  refreshDir: async (path) => {
    const state = get()
    if (state.loadingDirs.has(path)) return

    const dirEntry = path === ''
      ? undefined
      : state.entries.find((entry) => entry.relativePath === path && entry.isDirectory)

    if (path !== '' && !dirEntry) return
    if (!state.leftSource && !state.rightSource) return

    const requestCompareVersion = state.compareVersion
    const nextLoading = new Set(state.loadingDirs)
    nextLoading.add(path)
    set({ loadingDirs: nextLoading })

    try {
      const nextChildren = await loadDirectoryChildren(path, dirEntry, state.leftSource, state.rightSource)
      if (requestCompareVersion !== get().compareVersion) return

      set((current) => {
        const entries = replaceDirectoryChildren(current.entries, path, nextChildren)
        return {
          entries,
          entrySummary: summarizeCompareEntries(entries),
        }
      })
    } catch (error) {
      // 目录列取失败时向用户暴露错误，而不是伪装成空目录
      if (requestCompareVersion === get().compareVersion) {
        get().setError(error instanceof Error ? error.message : '读取目录失败')
      }
    } finally {
      const current = get()
      if (requestCompareVersion !== current.compareVersion) return

      const doneLoading = new Set(current.loadingDirs)
      doneLoading.delete(path)
      set({ loadingDirs: doneLoading })
    }
  },

  markDirtyPaths: (paths) => {
    if (paths.length === 0) {
      return
    }

    set((state) => {
      const mergedDirtyPaths = mergeDirtyPathSet(state.dirtyPaths, paths)
      return {
        dirtyPaths: mergedDirtyPaths.dirtyPaths,
        dirtyDisplayPaths: mergedDirtyPaths.dirtyDisplayPaths,
      }
    })
  },

  clearDirtyPaths: (roots) => {
    set((state) => {
      const clearedDirtyPaths = clearDirtyPathSet(state.dirtyPaths, roots)
      return {
        dirtyPaths: clearedDirtyPaths.dirtyPaths,
        dirtyDisplayPaths: clearedDirtyPaths.dirtyDisplayPaths,
      }
    })
  },

  setError: (error, compareId) => {
    if (compareId && get().activeCompareId !== compareId) return
    set({
      error,
      scanning: false,
      comparing: false,
      paused: false,
      loadingDirs: new Set(),
      activeCompareId: null,
      compareSessionId: null,
    })
  },
  setFilter: (filter) => set({ filter }),

  hydrateSourceInputs: (left, right) => {
    const leftState = deriveSourceState(left)
    const rightState = deriveSourceState(right)

    set({
      leftPath: leftState.path,
      rightPath: rightState.path,
      leftSourceType: leftState.sourceType,
      rightSourceType: rightState.sourceType,
      leftSSHConfigId: leftState.sshConfigId,
      rightSSHConfigId: rightState.sshConfigId,
    })
  },

  setSources: (left, right) => {
    const leftState = deriveSourceState(left)
    const rightState = deriveSourceState(right)

    set({
      leftSource: left,
      rightSource: right,
      leftPath: leftState.path,
      rightPath: rightState.path,
      leftSourceType: leftState.sourceType,
      rightSourceType: rightState.sourceType,
      leftSSHConfigId: leftState.sshConfigId,
      rightSSHConfigId: rightState.sshConfigId,
    })
  },

  setViewMode: (viewMode) => set({ viewMode }),

  toggleDir: (path) => {
    const next = new Set(get().expandedDirs)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
    }
    set({ expandedDirs: next })
  },

  expandDir: (path) => {
    const state = get()
    const isExpanded = state.expandedDirs.has(path)

    if (isExpanded) {
      const next = new Set(state.expandedDirs)
      next.delete(path)
      set({ expandedDirs: next })
      return
    }

    const nextExpanded = new Set(state.expandedDirs)
    nextExpanded.add(path)
    set({ expandedDirs: nextExpanded })

    const hasChildren = state.entries.some((e) => {
      return isDirectChildPath(path, e.relativePath)
    })
    if (hasChildren) return

    void get().refreshDir(path)
  },

  expandAll: () => {
    const dirs = new Set<string>()
    for (const entry of get().entries) {
      if (entry.isDirectory) dirs.add(entry.relativePath)
    }
    set({ expandedDirs: dirs })
  },

  collapseAll: () => set({ expandedDirs: new Set() }),

  resetCompare: () => {
    const { compareVersion, syncTask } = get()
    set({
      ...compareInitial,
      compareVersion: compareVersion + 1,
      syncTask,
      leftSource: syncTask?.leftSource ?? null,
      rightSource: syncTask?.rightSource ?? null,
    })
  },

  invalidateCompareResult: () => {
    const { compareVersion, syncTask, filter, viewMode } = get()
    set({
      ...compareInitial,
      compareVersion: compareVersion + 1,
      syncTask,
      filter,
      viewMode,
    })
  },
  setSyncTask: (syncTask) => set({ syncTask }),

  createSnapshot: () => createCompareSessionSnapshot(get()),

  createLightweightSnapshot: () => createCompareSessionSnapshot(get(), { includeEntries: false }),

  createTabSnapshot: () => {
    const state = get()
    return createCompareSessionSnapshot(state, { includeEntries: state.entries.length <= MAX_COMPARE_TAB_SNAPSHOT_ENTRIES })
  },

  restoreSnapshot: (snapshot) => {
    const { compareVersion } = get()
    const restoredSnapshot = clearInactiveIncompleteSnapshot(snapshot)

    set({
      leftPath: restoredSnapshot.leftPath,
      rightPath: restoredSnapshot.rightPath,
      leftSourceType: restoredSnapshot.leftSourceType,
      rightSourceType: restoredSnapshot.rightSourceType,
      leftSSHConfigId: restoredSnapshot.leftSSHConfigId,
      rightSSHConfigId: restoredSnapshot.rightSSHConfigId,
      strategies: [...restoredSnapshot.strategies],
      extensionFilter: [...restoredSnapshot.extensionFilter],
      hideDot: restoredSnapshot.hideDot,
      hideDotFilter: restoredSnapshot.hideDotFilter,
      entries: [...restoredSnapshot.entries],
      entrySummary: summarizeCompareEntries(restoredSnapshot.entries),
      scanning: restoredSnapshot.scanning,
      comparing: restoredSnapshot.comparing,
      paused: restoredSnapshot.paused,
      done: restoredSnapshot.done,
      error: restoredSnapshot.error,
      duration: restoredSnapshot.duration,
      leftSource: restoredSnapshot.leftSource,
      rightSource: restoredSnapshot.rightSource,
      dirtyPaths: new Set(restoredSnapshot.dirtyPaths ?? []),
      dirtyDisplayPaths: buildDirtyDisplayPaths(new Set(restoredSnapshot.dirtyPaths ?? [])),
      loadingDirs: new Set(restoredSnapshot.loadingDirs),
      filter: restoredSnapshot.filter,
      expandedDirs: new Set(restoredSnapshot.expandedDirs),
      viewMode: restoredSnapshot.viewMode,
      activeCompareId: restoredSnapshot.activeCompareId,
      compareSessionId: restoredSnapshot.compareSessionId ?? restoredSnapshot.activeCompareId,
      compareVersion: compareVersion + 1,
    })
  },
}))

function withDerivedEntrySummary<T extends CompareStoreStateUpdate>(
  partial: T,
  currentState: CompareStore,
): T {
  if (!('entries' in partial) || partial.entrySummary != null) {
    return partial
  }

  return {
    ...partial,
    entrySummary: summarizeCompareEntries(partial.entries ?? currentState.entries),
  }
}

const originalCompareStoreSetState = compareStore.setState.bind(compareStore)

// 与 zustand setState 的两个重载一一对应，保证 replace=true 时必须传入完整状态
type CompareStoreSetStateArgs =
  | [partial: CompareStore | Partial<CompareStore> | ((state: CompareStore) => CompareStore | Partial<CompareStore>), replace?: false]
  | [state: CompareStore | ((state: CompareStore) => CompareStore), replace: true]

compareStore.setState = (...args: CompareStoreSetStateArgs) => {
  if (args[1] === true) {
    const [state] = args
    originalCompareStoreSetState(
      typeof state === 'function'
        ? (current) => withDerivedEntrySummary(state(current), current)
        : withDerivedEntrySummary(state, compareStore.getState()),
      true,
    )
    return
  }

  const [partial, replace] = args
  originalCompareStoreSetState(
    typeof partial === 'function'
      ? (current) => withDerivedEntrySummary(partial(current), current)
      : withDerivedEntrySummary(partial, compareStore.getState()),
    replace,
  )
}

export const useCompareStore = compareStore
