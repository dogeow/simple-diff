import { useMemo } from 'react'
import { mergePathFilters } from '@shared/path-filter'
import type { CompareEntry, CompareFilter } from '../../../shared/types'
import { useCompareStore } from '../stores/compare-store'
import { useSettingsStore } from '../stores/settings-store'
import { buildTree, getVisibleNodes, prepareCompareEntries, type TreeNode, type TreeSide } from '../utils/tree-utils'

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
  const expandedDirs = useCompareStore((state) => state.expandedDirs)
  const extensionFilter = useCompareStore((state) => state.extensionFilter)
  const hideDot = useCompareStore((state) => state.hideDot)
  const hideDotFilter = useCompareStore((state) => state.hideDotFilter)
  const globalPathFilters = useSettingsStore((state) => state.globalPathFilters)
  const pathFilter = useMemo(
    () => mergePathFilters(globalPathFilters, extensionFilter),
    [extensionFilter, globalPathFilters],
  )

  const preparedEntries = useMemo(
    () =>
      prepareCompareEntries(entries, {
        filter,
        pathFilter,
        hideDot,
        hideDotFilter,
        side,
      }),
    [entries, filter, hideDot, hideDotFilter, pathFilter, side],
  )

  const tree = useMemo(() => buildTree(preparedEntries), [preparedEntries])
  return useMemo(() => getVisibleNodes(tree, expandedDirs), [tree, expandedDirs])
}
