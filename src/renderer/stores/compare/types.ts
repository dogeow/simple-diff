import type {
  CompareFilter,
  CompareEntry,
  CompareResult,
  CompareStats,
  SourceConfig,
  StrategyName,
  SyncTaskSnapshot,
} from '../../../../shared/types'

export type ViewMode = 'split' | 'merged'
export type HideDotFilter = 'all' | 'files' | 'dirs'

export interface CompareEntrySummary {
  readonly stats: CompareStats
  readonly pendingCount: number
  readonly allDirCount: number
}

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
  readonly dirtyPaths: readonly string[]
  readonly loadingDirs: readonly string[]
  readonly filter: CompareFilter
  readonly expandedDirs: readonly string[]
  readonly viewMode: ViewMode
  readonly activeCompareId: string | null
  readonly compareSessionId?: string | null
}

export interface CompareStore {
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
  readonly dirtyPaths: ReadonlySet<string>
  readonly dirtyDisplayPaths: ReadonlySet<string>
  readonly loadingDirs: ReadonlySet<string>

  readonly filter: CompareFilter
  readonly expandedDirs: ReadonlySet<string>
  readonly viewMode: ViewMode
  readonly activeCompareId: string | null
  readonly compareSessionId: string | null
  readonly syncTask: SyncTaskSnapshot | null
  readonly compareVersion: number
  readonly entrySummary: CompareEntrySummary

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
  updateEntries: (compareId: string, entries: readonly CompareEntry[]) => void
  finishCompare: (compareId: string, result: CompareResult) => void
  applyPartialCompareResult: (roots: readonly string[], entries: readonly CompareEntry[]) => void
  pauseCompare: (compareId?: string) => void
  removeEntry: (relativePath: string) => void
  refreshDir: (relativePath: string) => Promise<void>
  markDirtyPaths: (paths: readonly string[]) => void
  clearDirtyPaths: (roots?: readonly string[]) => void
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
  createLightweightSnapshot: () => CompareSessionSnapshot
  createTabSnapshot: () => CompareSessionSnapshot
  restoreSnapshot: (snapshot: CompareSessionSnapshot) => void
}

export type CompareStoreStateUpdate = CompareStore | Partial<CompareStore>
