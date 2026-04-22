import { hasCompareSessionContent, useCompareStore } from '../stores/compare-store'
import { useAppStore, type Page } from '../stores/app-store'
import { useLogStore } from '../stores/log-store'

function persistActiveCompareTab(): void {
  const appState = useAppStore.getState()
  const compareState = useCompareStore.getState()
  const currentSnapshot = compareState.createSnapshot()
  const compareTabId = appState.activeCompareTabId

  if (!compareTabId || !hasCompareSessionContent(currentSnapshot)) {
    return
  }

  const currentCompareTab = appState.compareTabs.find((tab) => tab.id === compareTabId)
  appState.saveCompareTab({
    id: compareTabId,
    title: currentCompareTab?.title ?? '未命名对比',
    snapshot: currentSnapshot,
    diffTabs: appState.diffTabs,
    activeDiffTabId: appState.activeDiffTabId,
  })
}

export { persistActiveCompareTab }

export function openCompareTab(compareTabId?: string, options?: { readonly expandLogs?: boolean }): boolean {
  const appState = useAppStore.getState()
  const targetCompareTab = compareTabId
    ? appState.compareTabs.find((tab) => tab.id === compareTabId)
    : appState.compareTabs.find((tab) => tab.id === appState.activeCompareTabId)
      ?? appState.compareTabs[appState.compareTabs.length - 1]

  if (!targetCompareTab) {
    return false
  }

  useCompareStore.getState().restoreSnapshot(targetCompareTab.snapshot)
  appState.replaceDiffTabs(targetCompareTab.diffTabs, targetCompareTab.activeDiffTabId)
  appState.setActiveCompareTab(targetCompareTab.id)
  appState.setPage('compare')

  if (options?.expandLogs) {
    useLogStore.getState().setVisible(true)
  }

  return true
}

export function leaveComparePage(nextPage: Exclude<Page, 'compare'>): void {
  const appState = useAppStore.getState()
  const compareState = useCompareStore.getState()
  const currentSnapshot = compareState.createSnapshot()
  persistActiveCompareTab()

  appState.replaceDiffTabs([], null)
  compareState.resetCompare()
  useCompareStore.setState({
    leftPath: currentSnapshot.leftPath,
    rightPath: currentSnapshot.rightPath,
    leftSourceType: currentSnapshot.leftSourceType,
    rightSourceType: currentSnapshot.rightSourceType,
    leftSSHConfigId: currentSnapshot.leftSSHConfigId,
    rightSSHConfigId: currentSnapshot.rightSSHConfigId,
    leftSource: null,
    rightSource: null,
    strategies: [...currentSnapshot.strategies],
    extensionFilter: [...currentSnapshot.extensionFilter],
    hideDot: currentSnapshot.hideDot,
    hideDotFilter: currentSnapshot.hideDotFilter,
  })
  appState.setPage(nextPage)
}

export function openDirectoryCompareHome(): void {
  leaveComparePage('home')
}