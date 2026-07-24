import type { CompareEntry, SourceConfig, StrategyName, SyncTaskSnapshot } from '../../../../shared/types'
import { createEmptyCompareEntrySummary } from './entry-summary'
import type { HideDotFilter, ViewMode } from './types'

export const compareInitial = {
  entries: [] as readonly CompareEntry[],
  entrySummary: createEmptyCompareEntrySummary(),
  scanning: false,
  comparing: false,
  paused: false,
  done: false,
  error: null as string | null,
  duration: 0,
  leftSource: null as SourceConfig | null,
  rightSource: null as SourceConfig | null,
  dirtyPaths: new Set<string>() as ReadonlySet<string>,
  dirtyDisplayPaths: new Set<string>() as ReadonlySet<string>,
  loadingDirs: new Set<string>() as ReadonlySet<string>,
  filter: 'all' as const,
  expandedDirs: new Set<string>() as ReadonlySet<string>,
  viewMode: 'split' as ViewMode,
  activeCompareId: null as string | null,
  compareSessionId: null as string | null,
  syncTask: null as SyncTaskSnapshot | null,
}

export const initialState = {
  leftPath: '',
  rightPath: '',
  leftSourceType: 'local' as const,
  rightSourceType: 'local' as const,
  leftSSHConfigId: '',
  rightSSHConfigId: '',
  strategies: ['size', 'mtime'] as readonly StrategyName[],
  extensionFilter: ['node_modules', '.git', 'dist', '.DS_Store'] as readonly string[],
  hideDot: false,
  hideDotFilter: 'all' as HideDotFilter,
  compareVersion: 0,
  ...compareInitial,
}
