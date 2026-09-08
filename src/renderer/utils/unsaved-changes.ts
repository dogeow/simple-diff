import { useAppStore, type DiffTab } from '../stores/app-store'
import { useUIStore } from '../stores/ui-store'

export function isDiffTabDirty(tab: DiffTab): boolean {
  return tab.leftContent !== tab.originalLeftContent || tab.rightContent !== tab.originalRightContent
}

export function getSessionDiffTabs(sessionId: string | null): readonly DiffTab[] {
  const state = useAppStore.getState()
  return sessionId === state.activeCompareTabId
    ? state.diffTabs
    : state.compareTabs.find((tab) => tab.id === sessionId)?.diffTabs ?? []
}

export function getAllDiffTabs(): readonly DiffTab[] {
  const state = useAppStore.getState()
  const tabs = [...state.compareTabs.flatMap((tab) => tab.id === state.activeCompareTabId ? [] : tab.diffTabs), ...state.diffTabs]
  return [...new Map(tabs.map((tab) => [tab.sessionId, tab])).values()]
}

/** A cancelled dialog must leave the caller's state untouched. */
export function confirmUnsavedChanges(tabs: readonly DiffTab[] = useAppStore.getState().diffTabs): Promise<boolean> {
  const dirtyTabs = tabs.filter(isDiffTabDirty)
  if (dirtyTabs.length === 0) return Promise.resolve(true)
  if (useUIStore.getState().pendingUnsavedChanges || useUIStore.getState().pendingDiffTabClose) return Promise.resolve(false)
  return new Promise((resolve) => {
    useUIStore.getState().setPendingUnsavedChanges({ tabs: dirtyTabs, resolve })
  })
}
