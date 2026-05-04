import { trimTrailingSeparators } from '@shared/source-path'
import type { SourceConfig } from '../../../shared/types'
import { hasCompareSessionContent, useCompareStore, type CompareSessionSnapshot } from '../stores/compare-store'
import { useAppStore, type CompareTab, type Page } from '../stores/app-store'
import { useLogStore } from '../stores/log-store'

function isSameSource(left: SourceConfig, right: SourceConfig): boolean {
  if (left.type !== right.type) {
    return false
  }

  if (trimTrailingSeparators(left.path) !== trimTrailingSeparators(right.path)) {
    return false
  }

  if (left.type === 'sftp' && right.type === 'sftp') {
    return left.configId === right.configId
  }

  return true
}

function resolveSnapshotSource(snapshot: CompareSessionSnapshot, side: 'left' | 'right'): SourceConfig | null {
  const source = side === 'left' ? snapshot.leftSource : snapshot.rightSource
  if (source) {
    return source
  }

  const sourceType = side === 'left' ? snapshot.leftSourceType : snapshot.rightSourceType
  const path = side === 'left' ? snapshot.leftPath : snapshot.rightPath

  if (!path) {
    return null
  }

  if (sourceType === 'sftp') {
    const configId = side === 'left' ? snapshot.leftSSHConfigId : snapshot.rightSSHConfigId
    if (!configId) {
      return null
    }

    return { type: 'sftp', configId, path }
  }

  return { type: 'local', path }
}

function snapshotMatchesSources(
  snapshot: CompareSessionSnapshot,
  leftSource: SourceConfig,
  rightSource: SourceConfig,
): boolean {
  const snapshotLeftSource = resolveSnapshotSource(snapshot, 'left')
  const snapshotRightSource = resolveSnapshotSource(snapshot, 'right')

  if (!snapshotLeftSource || !snapshotRightSource) {
    return false
  }

  return isSameSource(snapshotLeftSource, leftSource)
    && isSameSource(snapshotRightSource, rightSource)
}

export function findCompareTabForSources(
  compareTabs: readonly CompareTab[],
  activeCompareTabId: string | null,
  leftSource: SourceConfig,
  rightSource: SourceConfig,
): CompareTab | null {
  const activeCompareTab = activeCompareTabId
    ? compareTabs.find((tab) => tab.id === activeCompareTabId)
    : undefined

  if (activeCompareTab && snapshotMatchesSources(activeCompareTab.snapshot, leftSource, rightSource)) {
    return activeCompareTab
  }

  for (let index = compareTabs.length - 1; index >= 0; index -= 1) {
    const compareTab = compareTabs[index]
    if (snapshotMatchesSources(compareTab.snapshot, leftSource, rightSource)) {
      return compareTab
    }
  }

  return null
}

function persistActiveCompareTab(): void {
  const appState = useAppStore.getState()
  const compareState = useCompareStore.getState()
  const currentSnapshot = compareState.createTabSnapshot()
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

export function openSyncTaskView(options?: { readonly expandLogs?: boolean }): boolean {
  const syncTask = useCompareStore.getState().syncTask

  if (!syncTask) {
    const opened = openCompareTab(undefined, options)
    if (!opened) {
      useAppStore.getState().setPage('sync')
    }
    return true
  }

  const appState = useAppStore.getState()
  const matchingCompareTab = findCompareTabForSources(
    appState.compareTabs,
    appState.activeCompareTabId,
    syncTask.leftSource,
    syncTask.rightSource,
  )

  if (matchingCompareTab) {
    useCompareStore.getState().restoreSnapshot(matchingCompareTab.snapshot)
    appState.replaceDiffTabs(matchingCompareTab.diffTabs, matchingCompareTab.activeDiffTabId)
    appState.setActiveCompareTab(matchingCompareTab.id)
  }

  appState.setPage('sync')

  if (options?.expandLogs) {
    useLogStore.getState().setVisible(true)
  }

  return true
}

export function leaveComparePage(nextPage: Exclude<Page, 'compare'>): void {
  const appState = useAppStore.getState()
  const compareState = useCompareStore.getState()
  const currentSnapshot = compareState.createLightweightSnapshot()
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