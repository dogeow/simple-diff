import { useDeferredValue, useMemo } from 'react'
import { mergePathFilters } from '@shared/path-filter'
import { useShallow } from 'zustand/react/shallow'
import type { CompareEntry, CompareFilter } from '../../../shared/types'
import { useCompareStore } from '../stores/compare-store'
import { useSettingsStore } from '../stores/settings-store'
import { addRendererLog } from '../stores/log-store'
import { formatRendererMemoryUsage } from '../utils/renderer-memory'
import { buildVisibleNodeList, prepareCompareEntries, type TreeSide, type VisibleTreeNodes } from '../utils/tree-utils'

interface UseVisibleCompareNodesOptions {
  readonly entries: readonly CompareEntry[]
  readonly filter: CompareFilter
  readonly side?: TreeSide
}

const HEAVY_ENTRIES_THRESHOLD = 50_000

export function useVisibleCompareNodes({
  entries,
  filter,
  side,
}: UseVisibleCompareNodesOptions): VisibleTreeNodes {
  const deferredEntries = useDeferredValue(entries)
  const { expandedDirs, extensionFilter, hideDot, hideDotFilter } = useCompareStore(useShallow((state) => ({
    expandedDirs: state.expandedDirs,
    extensionFilter: state.extensionFilter,
    hideDot: state.hideDot,
    hideDotFilter: state.hideDotFilter,
  })))
  const globalPathFilters = useSettingsStore((state) => state.globalPathFilters)
  const pathFilter = useMemo(
    () => mergePathFilters(globalPathFilters, extensionFilter),
    [extensionFilter, globalPathFilters],
  )

  const preparedEntries = useMemo(
    () => {
      if (deferredEntries.length < HEAVY_ENTRIES_THRESHOLD) {
        return prepareCompareEntries(deferredEntries, { filter, pathFilter, hideDot, hideDotFilter, side })
      }
      addRendererLog(
        'compare',
        'info',
        `prepareCompareEntries:start side=${side ?? 'merged'} filter=${filter} entries=${deferredEntries.length} ${formatRendererMemoryUsage()}`,
      )
      const startedAt = performance.now()
      const result = prepareCompareEntries(deferredEntries, { filter, pathFilter, hideDot, hideDotFilter, side })
      const elapsed = (performance.now() - startedAt).toFixed(1)
      addRendererLog(
        'compare',
        'info',
        `prepareCompareEntries side=${side ?? 'merged'} filter=${filter} entries=${deferredEntries.length} -> ${result.length} ${elapsed}ms ${formatRendererMemoryUsage()}`,
      )
      return result
    },
    [deferredEntries, filter, hideDot, hideDotFilter, pathFilter, side],
  )

  return useMemo(
    () => {
      if (preparedEntries.length < HEAVY_ENTRIES_THRESHOLD) {
        return buildVisibleNodeList(preparedEntries, expandedDirs)
      }
      addRendererLog(
        'compare',
        'info',
        `buildVisibleNodeList:start side=${side ?? 'merged'} prepared=${preparedEntries.length} expanded=${expandedDirs.size} ${formatRendererMemoryUsage()}`,
      )
      const startedAt = performance.now()
      const result = buildVisibleNodeList(preparedEntries, expandedDirs)
      const elapsed = (performance.now() - startedAt).toFixed(1)
      addRendererLog(
        'compare',
        'info',
        `buildVisibleNodeList side=${side ?? 'merged'} prepared=${preparedEntries.length} -> visible=${result.length} ${elapsed}ms ${formatRendererMemoryUsage()}`,
      )
      return result
    },
    [expandedDirs, preparedEntries, side],
  )
}
