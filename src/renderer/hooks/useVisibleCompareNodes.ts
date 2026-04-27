import { useDeferredValue, useMemo } from 'react'
import { mergePathFilters } from '@shared/path-filter'
import { useShallow } from 'zustand/react/shallow'
import type { CompareEntry, CompareFilter } from '../../../shared/types'
import { useCompareStore } from '../stores/compare-store'
import { useSettingsStore } from '../stores/settings-store'
import { buildVisibleNodes, prepareCompareEntries, type TreeNode, type TreeSide } from '../utils/tree-utils'

interface UseVisibleCompareNodesOptions {
  readonly entries: readonly CompareEntry[]
  readonly filter: CompareFilter
  readonly side?: TreeSide
}

export function useVisibleCompareNodes({
  entries,
  filter,
  side,
}: UseVisibleCompareNodesOptions): readonly TreeNode[] {
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
    () =>
      prepareCompareEntries(deferredEntries, {
        filter,
        pathFilter,
        hideDot,
        hideDotFilter,
        side,
      }),
    [deferredEntries, filter, hideDot, hideDotFilter, pathFilter, side],
  )

  return useMemo(() => buildVisibleNodes(preparedEntries, expandedDirs), [expandedDirs, preparedEntries])
}
