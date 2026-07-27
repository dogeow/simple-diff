import { useCallback } from 'react'
import type { CompareHistoryEntry } from '../../../shared/types'
import { useCompareStore } from '../stores/compare-store'
import { startNewCompareSession } from '../utils/compare-session-navigation'
import { useCompareActions } from './useCompare'

/**
 * F8：「重新对比」= 直接开一个**已经在跑**的新对比标签。
 *
 * 旧 `HistoryPage.tsx:144-168` 只是写六个 store 字段然后 `setPage('home')`，用户还得
 * 在另一块界面上再按一次开始。现在标签栏的 `新建对比 ▾ → 最近对比` 和历史叠加层的
 * `重新对比` 走的是同一个函数，两处不会再分叉。
 *
 * 顺序是有意义的：先 `startNewCompareSession()` 把当前 live 会话写回它自己的标签，
 * 再灌入历史来源。反过来的话，那次写回会把历史条目的路径盖到上一个标签的快照上
 * （树还是旧结果，路径栏却变了）。退回 setup 态同时保证 `runCompare()` 开的是一个
 * **新**标签，而不是复用当前这个。
 */
export function useOpenHistoryPair(): (entry: CompareHistoryEntry) => void {
  const { runCompare } = useCompareActions()

  return useCallback((entry: CompareHistoryEntry) => {
    startNewCompareSession()
    useCompareStore.getState().hydrateSourceInputs(entry.leftSource, entry.rightSource)
    void runCompare()
  }, [runCompare])
}
