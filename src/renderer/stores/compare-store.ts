import { create } from 'zustand'
import { joinSourcePath } from '@shared/source-path'
import type {
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
  readonly done: boolean
  readonly error: string | null
  readonly duration: number
  readonly leftSource: SourceConfig | null
  readonly rightSource: SourceConfig | null
  readonly loadingDirs: ReadonlySet<string>

  readonly filter: CompareState | 'all'
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

  startScanning: (compareId: string) => void
  setScanEntries: (compareId: string, entries: readonly CompareEntry[]) => void
  updateEntry: (compareId: string, entry: CompareEntry) => void
  finishCompare: (compareId: string, result: CompareResult) => void
  removeEntry: (relativePath: string) => void
  refreshDir: (relativePath: string) => Promise<void>
  setError: (error: string | null, compareId?: string) => void
  setFilter: (filter: CompareState | 'all') => void
  setSources: (left: SourceConfig, right: SourceConfig) => void
  setViewMode: (mode: ViewMode) => void
  toggleDir: (path: string) => void
  expandDir: (path: string) => void
  expandAll: () => void
  collapseAll: () => void
  resetCompare: () => void
  setSyncTask: (task: SyncTaskSnapshot | null) => void
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
  hideDot: true,
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
    const relativePath = `${parentRelative}/${name}`

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
          relativePath, name, isDirectory: isDir, state: 'equal',
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

  startScanning: (activeCompareId) => set((state) => ({
    ...compareInitial,
    activeCompareId,
    scanning: true,
    compareVersion: state.compareVersion + 1,
  })),

  setScanEntries: (compareId, newEntries) => {
    if (get().activeCompareId !== compareId) return
    set((state) => ({
      entries: upsertEntries(state.entries, newEntries),
      scanning: true,
      comparing: true,
    }))
  },

  updateEntry: (compareId, entry) => {
    if (get().activeCompareId !== compareId) return
    set((state) => ({ entries: upsertEntries(state.entries, [entry]) }))
  },

  finishCompare: (compareId, result) => {
    if (get().activeCompareId !== compareId) return
    set({
      entries: upsertEntries([], result.entries),
      scanning: false,
      comparing: false,
      done: true,
      duration: result.duration,
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
    set({ error, scanning: false, comparing: false })
  },
  setFilter: (filter) => set({ filter }),

  setSources: (left, right) => set({ leftSource: left, rightSource: right }),

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
  setSyncTask: (syncTask) => set({ syncTask }),
}))

export { computeStats }
