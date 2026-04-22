import { useMemo } from 'react'
import type { CompareEntry, CompareState } from '../../../shared/types'
import { useCompareStore } from '../stores/compare-store'
import { buildTree, getVisibleNodes, prepareCompareEntries, type TreeNode, type TreeSide } from '../utils/tree-utils'

interface UseVisibleCompareNodesOptions {
  readonly entries: readonly CompareEntry[]
  readonly filter: CompareState | 'all'
  readonly side?: TreeSide
}

export function useVisibleCompareNodes({
  entries,
  filter,
  side,
}: UseVisibleCompareNodesOptions): readonly TreeNode[] {
  const expandedDirs = useCompareStore((state) => state.expandedDirs)
  const hideDot = useCompareStore((state) => state.hideDot)
  const hideDotFilter = useCompareStore((state) => state.hideDotFilter)

  const preparedEntries = useMemo(
    () =>
      prepareCompareEntries(entries, {
        filter,
        pathFilter: [],
        hideDot,
        hideDotFilter,
        side,
      }),
    [entries, filter, hideDot, hideDotFilter, side],
  )

  const tree = useMemo(() => buildTree(preparedEntries), [preparedEntries])
  return useMemo(() => getVisibleNodes(tree, expandedDirs), [tree, expandedDirs])
}
