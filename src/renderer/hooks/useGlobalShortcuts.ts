import { useEffect } from 'react'
import { isTypingTarget } from '../utils/typing-target'
import { useAppStore } from '../stores/app-store'
import { useUIStore } from '../stores/ui-store'
import {
  cycleDiffTab,
  getVisibleSyncTask,
  hasCompareStrategies,
  isCompareRunning,
  openSessionFilterPopover,
  pauseCompareSync,
  requestCloseActiveDiffTab,
  resetDiffTabsForRerun,
  saveActiveDiffTabSide,
  showCompareTree,
  toggleLogPanel,
} from '../utils/command-actions'
import { useCompareActions } from './useCompare'
import { matchesShortcut, SHORTCUT_SPECS } from './shortcuts'

/**
 * 蓝图 chunk 9 第 3 条：全局快捷键层。
 *
 * 挂在 `AppShell` 上一次，取代原来散落的两处监听器——`AppShell` 自己的
 * `⌘K / ⌘, / ⌘J / ?`，以及 `CompareToolbar` 里的 `⌘R / ⌘F / ⌘.`。
 * 后者顺手修掉一个真实缺陷：`ComparePage` 只在没有活动 diff 标签时渲染
 * `CompareToolbar`，所以打开任意一个文件 Diff 之后，那三个键会静默失效。
 *
 * 这个 hook 刻意**不订阅任何 store**。它挂在壳层上，一旦订阅 compare store，
 * 流式扫描期间每来一条 entry 都会重渲染状态栏、日志面板和叠加层宿主。
 * 所有判断都在按键那一刻用 `getState()` 现读（`utils/command-actions.ts`），
 * `useCompareActions()` 返回的四个回调本身也是零订阅的稳定引用。
 *
 * 分层：属于「某个对比标签」的键（`⌘N` / `⌘1…9` / `⇧⌘W` / `E`）留在
 * `useCompareTabShortcuts`，因为它们要用 `ComparePage` 的本地关闭 / 切换逻辑；
 * 属于某个视图内部的键（`⌘⌥↑↓` 跳差异块、`⌘⇧L` 手动对齐）按 §5 留在各自视图里。
 *
 * 文件 Diff 那一组（`⌘S` / `⇧⌘S` / `⌘W` / `⌘0` / `⌥←→`）在这里而不是
 * `FileDiffView` 里：`⌘W` 和 `⌥←→` 在目录树态也得管用（关掉后台那个脏标签、
 * 切回某个已打开的文件），而 `FileDiffView` 只在自己被显示时才挂载。
 */
export function useGlobalShortcuts(): void {
  const { restartCompare, pauseCompare } = useCompareActions()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const ui = useUIStore.getState()

      // ⌘K 只负责“打开”命令面板；关闭交给 Esc（DESIGN-SYSTEM §8.1）。
      if (matchesShortcut(event, SHORTCUT_SPECS.palette)) {
        event.preventDefault()
        ui.openOverlay('palette')
        return
      }

      if (matchesShortcut(event, SHORTCUT_SPECS.settings)) {
        event.preventDefault()
        ui.openOverlay('settings')
        return
      }

      if (matchesShortcut(event, SHORTCUT_SPECS.toggleLog)) {
        event.preventDefault()
        toggleLogPanel()
        return
      }

      if (matchesShortcut(event, SHORTCUT_SPECS.shortcutHelp) && !isTypingTarget(event.target)) {
        event.preventDefault()
        ui.openOverlay('shortcuts')
        return
      }

      // Esc 不在这里处理：每个叠加层自己关自己（`Dialog` / `Popover` / `CommandPalette`），
      // 一个全局监听器会把弹层和它下面的对话框一起关掉。

      // 以下三个描述的是「当前对比视图的作业」。叠加层打开时它们属于那一层，
      // 文本模式下则根本没有作业可言。
      if (ui.overlay !== null || useAppStore.getState().page !== 'compare') return

      // ---- 文件 Diff 组（chunk 7）。动作实现和 `⌘K` 里的同名命令是同一批函数。
      if (matchesShortcut(event, SHORTCUT_SPECS.saveLeft)) {
        event.preventDefault()
        void saveActiveDiffTabSide('left')
        return
      }

      if (matchesShortcut(event, SHORTCUT_SPECS.saveRight)) {
        event.preventDefault()
        void saveActiveDiffTabSide('right')
        return
      }

      if (matchesShortcut(event, SHORTCUT_SPECS.closeDiffTab)) {
        event.preventDefault()
        requestCloseActiveDiffTab()
        return
      }

      if (matchesShortcut(event, SHORTCUT_SPECS.backToTree)) {
        event.preventDefault()
        showCompareTree()
        return
      }

      if (matchesShortcut(event, SHORTCUT_SPECS.prevDiffTab)) {
        event.preventDefault()
        cycleDiffTab(-1)
        return
      }

      if (matchesShortcut(event, SHORTCUT_SPECS.nextDiffTab)) {
        event.preventDefault()
        cycleDiffTab(1)
        return
      }

      if (matchesShortcut(event, SHORTCUT_SPECS.restartCompare)) {
        event.preventDefault()
        if (!hasCompareStrategies()) return
        resetDiffTabsForRerun()
        void restartCompare()
        return
      }

      if (matchesShortcut(event, SHORTCUT_SPECS.focusFilter)) {
        event.preventDefault()
        openSessionFilterPopover()
        return
      }

      // §7.3：取消永远和进度出现在同一处，`⌘.` 是它的键盘同义词。
      // 对比没在跑时，工具栏那条进度线描述的就是本标签的同步任务，`⌘.` 跟着它走。
      if (matchesShortcut(event, SHORTCUT_SPECS.cancelJob)) {
        event.preventDefault()
        if (isCompareRunning()) void pauseCompare()
        else if (getVisibleSyncTask()?.status === 'running') void pauseCompareSync()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pauseCompare, restartCompare])
}
