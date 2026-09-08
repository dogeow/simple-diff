import { trimTrailingSeparators } from '@shared/source-path'
import type { SourceConfig } from '../../../shared/types'
import { hasCompareSessionContent, useCompareStore, type CompareSessionSnapshot } from '../stores/compare-store'
import { useAppStore, type CompareTab } from '../stores/app-store'
import { useUIStore } from '../stores/ui-store'

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

/**
 * 不带参数 = 「显示对比工作区」，这是 `目录对比` 唯一的含义（§1.2.3 修的就是它以前
 * 在“恢复上一个结果”和“显示新建表单”之间摇摆）。
 *
 * 这条路径**不会**再 restore 任何快照，两个理由：
 * 1. F4 之后 compare store 从来不会因为离开工作区被重置，live 会话本来就还在。
 *    而对比完成后写回标签的是 lightweight 快照（`entries: []`，见
 *    `createCompareSessionSnapshot`），再 restore 一次等于把整棵结果树清空。
 * 2. `activeCompareTabId === null` 意味着用户正停在 setup 态。旧代码会退回
 *    `compareTabs.at(-1)`，把用户正在填的表单顶成一个旧结果。
 *
 * 返回值表示“工作区里现在有一个活动对比标签”，调用方据此决定是否还要做别的事。
 */
export function openCompareTab(compareTabId?: string): boolean {
  const appState = useAppStore.getState()

  if (!compareTabId) {
    appState.setPage('compare')
    return appState.activeCompareTabId !== null
  }

  const targetCompareTab = appState.compareTabs.find((tab) => tab.id === compareTabId)

  if (!targetCompareTab) {
    return false
  }

  // 点当前标签是空操作；restore 只会用快照覆盖更新的 live 状态。
  if (targetCompareTab.id === appState.activeCompareTabId) {
    appState.setPage('compare')
    return true
  }

  // chunk 5 第 3 条：切标签前先把 live 会话写回它自己的标签。放在这里而不是各个
  // 调用点，命令面板、标签栏、同步抽屉才不会各自漏掉一次。
  persistActiveCompareTab()

  useUIStore.getState().clearTreeSelection()
  useCompareStore.getState().restoreSnapshot(targetCompareTab.snapshot)
  appState.replaceDiffTabs(targetCompareTab.diffTabs, targetCompareTab.activeDiffTabId)
  appState.setActiveCompareTab(targetCompareTab.id)
  appState.setPage('compare')

  return true
}

/**
 * F7：同步任务不再是一个页面。这里改成“聚焦拥有该任务的对比标签 + 打开同步叠加层”，
 * 与状态栏的任务槽位是同一个落点（DESIGN-SYSTEM §7.2）。
 */
export function openSyncTaskView(): boolean {
  const syncTask = useCompareStore.getState().syncTask

  if (!syncTask) {
    useUIStore.getState().openOverlay('sync')
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
    openCompareTab(matchingCompareTab.id)
  }

  useUIStore.getState().openOverlay('sync')

  return true
}

/**
 * F1 + F4：新建对比不再是“离开对比页去 Home”。工作区始终存在，这里只是把当前标签
 * 持久化，然后把 live session 退回 setup 态——表单值（路径、来源类型、比较依据、
 * 会话过滤）全部保留，只清空结果。这正是旧 `leaveComparePage('home')` 的语义，
 * 减去那一次会摧毁上下文的导航。
 *
 * `resetCompare()` 会把 `leftSource`/`rightSource` 回填成同步任务的来源，所以必须
 * 显式清空它们——否则 `hasCompareSessionContent()` 仍为真，工作区会停在 result 态。
 */
export function startNewCompareSession(): void {
  const appState = useAppStore.getState()
  const compareState = useCompareStore.getState()
  const currentSnapshot = compareState.createLightweightSnapshot()
  persistActiveCompareTab()

  useUIStore.getState().clearTreeSelection()
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
  appState.setActiveCompareTab(null)
  appState.setPage('compare')
}