export type {
  CompareEntrySummary,
  CompareSessionSnapshot,
  CompareStore,
  HideDotFilter,
  ViewMode,
} from './types'

export type { CompareSessionContentSource } from './snapshot'

export {
  applyCompareErrorToSnapshot,
  applyEntryUpdatesToSnapshot,
  applyFinishCompareToSnapshot,
  applyPauseCompareToSnapshot,
  applyPausedCompareErrorToSnapshot,
  applyScanEntriesToSnapshot,
  createLightweightCompareSessionSnapshot,
  hasCompareSessionContent,
  sanitizePersistedCompareSessionSnapshot,
} from './snapshot'

export {
  applyDirtyPathsToSnapshot,
  clearDirtyPathsFromSnapshot,
} from './dirty-paths'

export {
  computeStats,
  summarizeCompareEntries,
} from './entry-summary'

export { useCompareStore } from './store'
