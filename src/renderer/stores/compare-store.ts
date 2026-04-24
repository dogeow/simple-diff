import { create } from 'zustand'
import { joinSourcePath } from '@shared/source-path'
import type {
  CompareFilter,
  CompareEntry,
  CompareResult,
  CompareState,
  CompareStats,
  FileEntry,
  SourceConfig,
  StrategyName,
  SyncTaskSnapshot,
} from '../../../shared/types'

export type ViewMode = 'split' | 'merged'
export type HideDotFilter = 'all' | 'files' | 'dirs'

export interface CompareSessionSnapshot {
  readonly leftPath: string
  readonly rightPath: string
  readonly leftSourceType: 'local' | 'sftp'
  readonly rightSourceType: 'local' | 'sftp'
  readonly leftSSHConfigId: string
  readonly rightSSHConfigId: string
  readonly strategies: readonly StrategyName[]
  readonly extensionFilter: readonly string[]
  readonly hideDot: boolean
  readonly hideDotFilter: HideDotFilter
  readonly entries: readonly CompareEntry[]
  readonly scanning: boolean
  readonly comparing: boolean
  readonly paused: boolean
  readonly done: boolean
  readonly error: string | null
  readonly duration: number
  readonly leftSource: SourceConfig | null
  readonly rightSource: SourceConfig | null
  readonly loadingDirs: readonly string[]
  readonly filter: CompareFilter
  readonly expandedDirs: readonly string[]
  readonly viewMode: ViewMode
  readonly activeCompareId: string | null
}

interface CompareStore {
  readonly leftPath: string
  readonly rightPath: string
  readonly leftSourceType: 'local' | 'sftp'
  readonly rightSourceType: 'local' | 'sftp'
  readonly leftSSHConfigId: string
  readonly rightSSHConfigId: string
  readonly strategies: readonly StrategyName[]
  readonly extensionFilter: readonly string[]
  readonly hideDot: boolean
  readonly hideDotFilter: HideDotFilter

  // Progressive entries
  readonly entries: readonly CompareEntry[]
  readonly scanning: boolean
  readonly comparing: boolean
  readonly paused: boolean
  readonly done: boolean
  readonly error: string | null
  readonly duration: number
  readonly leftSource: SourceConfig | null
  readonly rightSource: SourceConfig | null
  readonly loadingDirs: ReadonlySet<string>

  readonly filter: CompareFilter
  readonly expandedDirs: ReadonlySet<string>
  readonly viewMode: ViewMode
  readonly activeCompareId: string | null
  readonly syncTask: SyncTaskSnapshot | null
  readonly compareVersion: number

  setLeftPath: (path: string) => void
  setRightPath: (path: string) => void
  setLeftSourceType: (type: 'local' | 'sftp') => void
  setRightSourceType: (type: 'local' | 'sftp') => void
  setLeftSSHConfigId: (id: string) => void
  setRightSSHConfigId: (id: string) => void
  setStrategies: (strategies: readonly StrategyName[]) => void
  setExtensionFilter: (filter: readonly string[]) => void
  setHideDot: (hide: boolean) => void
  setHideDotFilter: (filter: HideDotFilter) => void

  startScanning: (compareId: string, options?: { readonly preserveEntries?: boolean }) => void
  setScanEntries: (compareId: string, entries: readonly CompareEntry[]) => void
  updateEntry: (compareId: string, entry: CompareEntry) => void
  finishCompare: (compareId: string, result: CompareResult) => void
  pauseCompare: (compareId?: string) => void
  removeEntry: (relativePath: string) => void
  refreshDir: (relativePath: string) => Promise<void>
  setError: (error: string | null, compareId?: string) => void
  setFilter: (filter: CompareFilter) => void
  hydrateSourceInputs: (left: SourceConfig, right: SourceConfig) => void
  setSources: (left: SourceConfig, right: SourceConfig) => void
  setViewMode: (mode: ViewMode) => void
  toggleDir: (path: string) => void
  expandDir: (path: string) => void
  expandAll: () => void
  collapseAll: () => void
  resetCompare: () => void
  invalidateCompareResult: () => void
  setSyncTask: (task: SyncTaskSnapshot | null) => void
  createSnapshot: () => CompareSessionSnapshot
  restoreSnapshot: (snapshot: CompareSessionSnapshot) => void
}

export function hasCompareSessionContent(snapshot: CompareSessionSnapshot): boolean {
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

export function sanitizePersistedCompareSessionSnapshot(snapshot: CompareSessionSnapshot): CompareSessionSnapshot {
  const sanitizedSnapshot = {
    ...snapshot,
    scanning: false,
    comparing: false,
    loadingDirs: [],
    activeCompareId: null,
  }

  return clearInactiveIncompleteSnapshot(sanitizedSnapshot)
}

function hasUnresolvedCompareEntries(entries: readonly CompareEntry[]): boolean {
  return entries.some((entry) => entry.state === 'pending' || entry.state === 'comparing')
}

function clearInactiveIncompleteSnapshot(snapshot: CompareSessionSnapshot): CompareSessionSnapshot {
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

export function applyScanEntriesToSnapshot(
  snapshot: CompareSessionSnapshot,
  compareId: string,
  entries: readonly CompareEntry[],
): CompareSessionSnapshot {
  if (snapshot.activeCompareId !== compareId) return snapshot

  return {
    ...snapshot,
    entries: upsertEntries(snapshot.entries, entries),
    scanning: true,
    comparing: true,
    paused: false,
    done: false,
    error: null,
  }
}

export function applyEntryUpdateToSnapshot(
  snapshot: CompareSessionSnapshot,
  compareId: string,
  entry: CompareEntry,
): CompareSessionSnapshot {
  if (snapshot.activeCompareId !== compareId) return snapshot

  return {
    ...snapshot,
    entries: upsertEntries(snapshot.entries, [entry]),
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
    activeCompareId: null,
  }
}

export function applyPausedCompareErrorToSnapshot(
  snapshot: CompareSessionSnapshot,
  error: string | null,
): CompareSessionSnapshot {
  if (!snapshot.paused || snapshot.activeCompareId !== null) return snapshot

  return {
    ...snapshot,
    paused: false,
    error,
  }
}

export function applyFinishCompareToSnapshot(
  snapshot: CompareSessionSnapshot,
  compareId: string,
  result: CompareResult,
): CompareSessionSnapshot {
  if (snapshot.activeCompareId !== compareId) return snapshot

  return {
    ...snapshot,
    entries: upsertEntries([], result.entries),
    scanning: false,
    comparing: false,
    paused: false,
    done: true,
    error: null,
    duration: result.duration,
    loadingDirs: [],
    activeCompareId: null,
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
  }
}

function computeStats(entries: readonly CompareEntry[]): CompareStats {
  let equal = 0, different = 0, leftOnly = 0, rightOnly = 0
  for (const e of entries) {
    if (e.state === 'equal') equal++
    else if (e.state === 'different') different++
    else if (e.state === 'left_only') leftOnly++
    else if (e.state === 'right_only') rightOnly++
  }
  return { total: entries.length, equal, different, leftOnly, rightOnly }
}

const compareInitial = {
  entries: [] as readonly CompareEntry[],
  scanning: false,
  comparing: false,
  paused: false,
  done: false,
  error: null as string | null,
  duration: 0,
  leftSource: null as SourceConfig | null,
  rightSource: null as SourceConfig | null,
  loadingDirs: new Set<string>() as ReadonlySet<string>,
  filter: 'all' as const,
  expandedDirs: new Set<string>() as ReadonlySet<string>,
  viewMode: 'split' as ViewMode,
  activeCompareId: null as string | null,
  syncTask: null as SyncTaskSnapshot | null,
}

const initialState = {
  leftPath: '',
  rightPath: '',
  leftSourceType: 'local' as const,
  rightSourceType: 'local' as const,
  leftSSHConfigId: '',
  rightSSHConfigId: '',
  strategies: ['size', 'mtime'] as readonly StrategyName[],
  extensionFilter: ['node_modules', '.git', 'dist'] as readonly string[],
  hideDot: false,
  hideDotFilter: 'all' as HideDotFilter,
  compareVersion: 0,
  ...compareInitial,
}

/** Resolve absolute path for a subdir relative path given a SourceConfig. */
function resolveAbsPath(source: SourceConfig, relativePath: string): string {
  return joinSourcePath(source, source.path, relativePath)
}

function upsertEntries(
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

function isDirectChildPath(parentRelative: string, candidatePath: string): boolean {
  if (parentRelative === '') {
    return candidatePath !== '' && !candidatePath.includes('/')
  }

  if (!candidatePath.startsWith(`${parentRelative}/`)) return false
  return !candidatePath.slice(parentRelative.length + 1).includes('/')
}

function replaceDirectoryChildren(
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

function deriveSourceState(source: SourceConfig): {
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

function cloneEntries(entries: readonly CompareEntry[]): readonly CompareEntry[] {
  return [...entries]
}

function createCompareSessionSnapshot(state: CompareStore): CompareSessionSnapshot {
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
    entries: cloneEntries(state.entries),
    scanning: state.scanning,
    comparing: state.comparing,
    paused: state.paused,
    done: state.done,
    error: state.error,
    duration: state.duration,
    leftSource: state.leftSource,
    rightSource: state.rightSource,
    loadingDirs: [...state.loadingDirs],
    filter: state.filter,
    expandedDirs: [...state.expandedDirs],
    viewMode: state.viewMode,
    activeCompareId: state.activeCompareId,
  }
}

/** Match two file lists into CompareEntry[] for a given parent relative path. */
function matchChildren(
  leftList: readonly FileEntry[],
  rightList: readonly FileEntry[],
  parentRelative: string,
): CompareEntry[] {
  const leftMap = new Map<string, FileEntry>()
  for (const e of leftList) leftMap.set(e.name, e)

  const rightMap = new Map<string, FileEntry>()
  for (const e of rightList) rightMap.set(e.name, e)

  const allNames = new Set([...leftMap.keys(), ...rightMap.keys()])
  const entries: CompareEntry[] = []

  for (const name of allNames) {
    const left = leftMap.get(name)
    const right = rightMap.get(name)
    const isDir = left?.isDirectory ?? right?.isDirectory ?? false
    const relativePath = parentRelative ? `${parentRelative}/${name}` : name

    if (left && !right) {
      entries.push({ relativePath, name, isDirectory: isDir, state: 'left_only', left: { ...left, path: relativePath }, reasons: [] })
    } else if (!left && right) {
      entries.push({ relativePath, name, isDirectory: isDir, state: 'right_only', right: { ...right, path: relativePath }, reasons: [] })
    } else if (left && right) {
      // Simple size/mtime comparison for files
      if (!isDir) {
        const reasons: ('size' | 'mtime')[] = []
        if (left.size !== right.size) reasons.push('size')
        if (Math.abs(left.mtime - right.mtime) > 1000) reasons.push('mtime')
        const state = reasons.length > 0 ? 'different' : 'equal'
        entries.push({
          relativePath, name, isDirectory: isDir, state,
          left: { ...left, path: relativePath },
          right: { ...right, path: relativePath },
          reasons: reasons.map((reason) =>
            reason === 'size'
              ? { type: 'size', leftSize: left.size, rightSize: right.size }
              : { type: 'mtime', leftMtime: left.mtime, rightMtime: right.mtime },
          ),
        })
      } else {
        entries.push({
          relativePath, name, isDirectory: isDir, state: 'pending',
          left: { ...left, path: relativePath },
          right: { ...right, path: relativePath },
          reasons: [],
        })
      }
    }
  }

  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return entries
}

async function loadDirectoryChildren(
  path: string,
  dirEntry: CompareEntry | undefined,
  leftSource: SourceConfig | null,
  rightSource: SourceConfig | null,
): Promise<readonly CompareEntry[]> {
  if (!leftSource && !rightSource) return []

  const leftAbs = leftSource ? resolveAbsPath(leftSource, path) : null
  const rightAbs = rightSource ? resolveAbsPath(rightSource, path) : null

  const fetchLeft = dirEntry?.state !== 'right_only' && leftSource && leftAbs
  const fetchRight = dirEntry?.state !== 'left_only' && rightSource && rightAbs

  const leftP = fetchLeft
    ? window.api.listFiles(leftSource, leftAbs).then((r) => r.success && r.data ? r.data : [])
    : Promise.resolve([] as readonly FileEntry[])
  const rightP = fetchRight
    ? window.api.listFiles(rightSource, rightAbs).then((r) => r.success && r.data ? r.data : [])
    : Promise.resolve([] as readonly FileEntry[])

  const [leftList, rightList] = await Promise.all([leftP, rightP])
  return matchChildren(leftList, rightList, path)
}

export const useCompareStore = create<CompareStore>((set, get) => ({
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
    expandedDirs: options?.preserveEntries ? state.expandedDirs : compareInitial.expandedDirs,
    filter: options?.preserveEntries ? state.filter : compareInitial.filter,
    viewMode: options?.preserveEntries ? state.viewMode : compareInitial.viewMode,
    leftSource: options?.preserveEntries ? state.leftSource : compareInitial.leftSource,
    rightSource: options?.preserveEntries ? state.rightSource : compareInitial.rightSource,
    activeCompareId,
    scanning: true,
    paused: false,
    compareVersion: state.compareVersion + 1,
  })),

  setScanEntries: (compareId, newEntries) => {
    if (get().activeCompareId !== compareId) return
    set((state) => ({
      entries: upsertEntries(state.entries, newEntries),
      scanning: true,
      comparing: true,
      paused: false,
    }))
  },

  updateEntry: (compareId, entry) => {
    if (get().activeCompareId !== compareId) return
    set((state) => ({ entries: upsertEntries(state.entries, [entry]), paused: false }))
  },

  finishCompare: (compareId, result) => {
    if (get().activeCompareId !== compareId) return
    set({
      entries: upsertEntries([], result.entries),
      scanning: false,
      comparing: false,
      paused: false,
      done: true,
      error: null,
      duration: result.duration,
      loadingDirs: new Set(),
      activeCompareId: null,
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
      activeCompareId: null,
    })
  },

  removeEntry: (relativePath) => {
    const entries = get().entries.filter((e) =>
      e.relativePath !== relativePath && !e.relativePath.startsWith(relativePath + '/'),
    )
    set({ entries })
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

      set((current) => ({
        entries: replaceDirectoryChildren(current.entries, path, nextChildren),
      }))
    } finally {
      const current = get()
      if (requestCompareVersion !== current.compareVersion) return

      const doneLoading = new Set(current.loadingDirs)
      doneLoading.delete(path)
      set({ loadingDirs: doneLoading })
    }
  },

  setError: (error, compareId) => {
    if (compareId && get().activeCompareId !== compareId) return
    set({ error, scanning: false, comparing: false, paused: false, loadingDirs: new Set(), activeCompareId: null })
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

    // Collapsing — just toggle
    if (isExpanded) {
      const next = new Set(state.expandedDirs)
      next.delete(path)
      set({ expandedDirs: next })
      return
    }

    // Expanding — toggle open first
    const nextExpanded = new Set(state.expandedDirs)
    nextExpanded.add(path)
    set({ expandedDirs: nextExpanded })

    // Check if children already loaded
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
      entries: cloneEntries(restoredSnapshot.entries),
      scanning: restoredSnapshot.scanning,
      comparing: restoredSnapshot.comparing,
      paused: restoredSnapshot.paused,
      done: restoredSnapshot.done,
      error: restoredSnapshot.error,
      duration: restoredSnapshot.duration,
      leftSource: restoredSnapshot.leftSource,
      rightSource: restoredSnapshot.rightSource,
      loadingDirs: new Set(restoredSnapshot.loadingDirs),
      filter: restoredSnapshot.filter,
      expandedDirs: new Set(restoredSnapshot.expandedDirs),
      viewMode: restoredSnapshot.viewMode,
      activeCompareId: restoredSnapshot.activeCompareId,
      compareVersion: compareVersion + 1,
    })
  },
}))

export { computeStats }
