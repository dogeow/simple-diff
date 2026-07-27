import { useCallback } from 'react'
import { useAppStore } from '../stores/app-store'
import { useCompareStore } from '../stores/compare-store'
import { isFilterAdditionOnly } from '../utils/filter-change'
import { useCompareActions } from './useCompare'

/**
 * 会话过滤规则的唯一写入路径。
 *
 * 三个调用方（工具栏的 `过滤 ▾`、树行右键的『忽略』、分栏树）此前各自复制了同一段
 * 「写 store → 回写标签快照 → 判断是否只是新增 → 必要时重跑」的逻辑。纯新增规则
 * 走短路，不会重启一次可能很贵的对比（`isFilterAdditionOnly`）。
 */
export function useSessionFilterChange(): (nextFilters: readonly string[]) => Promise<void> {
  const { restartCompare } = useCompareActions()

  return useCallback(async (nextFilters: readonly string[]) => {
    const previousFilters = useCompareStore.getState().extensionFilter
    useCompareStore.getState().setExtensionFilter(nextFilters)

    const activeTabId = useAppStore.getState().activeCompareTabId
    if (activeTabId) {
      useAppStore.getState().updateCompareTabSnapshot(
        activeTabId,
        () => useCompareStore.getState().createTabSnapshot(),
      )
    }

    if (isFilterAdditionOnly(previousFilters, nextFilters)) {
      return
    }

    await restartCompare()
  }, [restartCompare])
}
