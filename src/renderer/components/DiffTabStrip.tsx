import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Copy, FolderOpen, FolderTree } from 'lucide-react'
import { useAppStore, type DiffTab } from '../stores/app-store'
import { copyPathToClipboard, requestCloseDiffTabs, showCompareTree } from '../utils/command-actions'
import { getRuntimeInfo } from '../runtime/runtime-info'
import { SHORTCUT } from '../hooks/shortcuts'
import { TabStrip, type DocumentTab, type MenuItem } from './ui'

interface TabSideTarget {
  readonly side: 'left' | 'right'
  readonly label: '左侧' | '右侧'
  readonly fullPath: string
  /** 只有本地数据源能在访达里显形；SFTP 侧后端会直接拒绝（`commands.rs::show_in_folder`）。 */
  readonly localSource: DiffTab['leftSource']
}

/**
 * 一个 diff 标签最多对应两个真实文件。两侧都在时菜单收成 `左侧 / 右侧` 子菜单，
 * 只有一侧时就是一个平项——和树行右键菜单（`useCompareRowActions` 的 `fanOut`）
 * 同一套说法，两处不会各自发明措辞。
 */
function sideTargets(tab: DiffTab | undefined): TabSideTarget[] {
  if (!tab) return []

  const targets: TabSideTarget[] = []
  if (tab.hasLeftFile && tab.leftFullPath) {
    targets.push({
      side: 'left',
      label: '左侧',
      fullPath: tab.leftFullPath,
      localSource: tab.leftSource?.type === 'local' ? tab.leftSource : null,
    })
  }
  if (tab.hasRightFile && tab.rightFullPath) {
    targets.push({
      side: 'right',
      label: '右侧',
      fullPath: tab.rightFullPath,
      localSource: tab.rightSource?.type === 'local' ? tab.rightSource : null,
    })
  }
  return targets
}

function fanOutItem(
  id: string,
  label: string,
  icon: typeof Copy,
  targets: readonly TabSideTarget[],
  run: (target: TabSideTarget) => void,
): MenuItem | null {
  if (targets.length === 0) return null
  if (targets.length === 1) {
    return { id, label, icon, onSelect: () => run(targets[0]) }
  }
  return {
    kind: 'submenu',
    id,
    label,
    icon,
    items: targets.map((target) => ({
      id: `${id}-${target.side}`,
      label: target.label,
      onSelect: () => run(target),
    })),
  }
}

/** 目录树那一站的合成 id；它不是一个真的 diff 标签。 */
const TREE_TAB_ID = '__tree__'

/**
 * 文件差异标签条（chunk 7 第 7 条）：手写的三段式按钮换成共享 `TabStrip`，
 * 于是它和对比会话标签条拿到的是同一套 `tablist` 语义、脏点和右键菜单。
 *
 * 关闭一律走 `requestCloseDiffTabs()`：有未保存修改时弹 `ConfirmDialog`
 * （`overlays/DiffTabCloseConfirm.tsx`），旧代码这里是 `window.confirm`（§7.5）。
 */
export default function DiffTabStrip() {
  const runtime = getRuntimeInfo()
  const isDesktopRuntime = runtime.mode === 'tauri' || runtime.mode === 'electron'
  const { diffTabs, activeDiffTabId, setActiveDiffTab } = useAppStore(useShallow((state) => ({
    diffTabs: state.diffTabs,
    activeDiffTabId: state.activeDiffTabId,
    setActiveDiffTab: state.setActiveDiffTab,
  })))

  const tabs = useMemo<DocumentTab[]>(
    () => [
      // 目录树是这条标签条的第 0 站，而不是它旁边的一个按钮：`⌥←/⌥→` 的循环
      // 也把它算作一站，所以它必须和文件标签共用同一份选中态与同一个 tablist。
      { id: TREE_TAB_ID, title: '目录树', icon: FolderTree, closable: false },
      ...diffTabs.map((tab) => ({
        id: tab.id,
        title: tab.fileName,
        tooltip: tab.fileName,
        dirty: tab.leftContent !== tab.originalLeftContent || tab.rightContent !== tab.originalRightContent,
      })),
    ],
    [diffTabs],
  )

  const buildActions = useCallback((tabId: string): MenuItem[] => {
    if (tabId === TREE_TAB_ID) return []
    const tab = diffTabs.find((candidate) => candidate.id === tabId)
    const others = diffTabs.filter((candidate) => candidate.id !== tabId).map((candidate) => candidate.id)
    const items: MenuItem[] = [
      { id: 'close', label: '关闭', shortcut: SHORTCUT.closeDiffTab, onSelect: () => requestCloseDiffTabs([tabId]) },
    ]

    if (others.length > 0) {
      items.push(
        { id: 'close-others', label: '关闭其他', onSelect: () => requestCloseDiffTabs(others) },
        {
          id: 'close-all',
          label: '关闭全部',
          danger: true,
          onSelect: () => requestCloseDiffTabs(diffTabs.map((candidate) => candidate.id)),
        },
      )
    }

    // 蓝图 §2.2 的另外两项。「复制路径」到处都能用；「在 Finder 中显示」只有桌面运行时
    // 的本地文件才给——`window.api.showInFolder` 在浏览器预览里是个空实现，对 SFTP 侧
    // 后端也只会回一句错，两种情况都不该在菜单里留一个按了没反应的条目。
    const targets = sideTargets(tab)
    const copyItem = fanOutItem('copy-path', '复制路径', Copy, targets, (target) => {
      void copyPathToClipboard(target.fullPath)
    })
    const revealTargets = isDesktopRuntime ? targets.filter((target) => target.localSource !== null) : []
    const revealItem = fanOutItem('reveal', '在 Finder 中显示', FolderOpen, revealTargets, (target) => {
      if (!target.localSource || !tab) return
      void window.api.showInFolder(target.localSource, tab.relativePath)
    })

    if (copyItem || revealItem) {
      items.push({ kind: 'separator', id: 'path-sep' })
      if (copyItem) items.push(copyItem)
      if (revealItem) items.push(revealItem)
    }

    return items
  }, [diffTabs, isDesktopRuntime])

  if (diffTabs.length === 0) return null

  return (
    <TabStrip
      aria-label="文件差异标签"
      tabs={tabs}
      activeId={activeDiffTabId ?? TREE_TAB_ID}
      onSelect={(id) => {
        if (id === TREE_TAB_ID) showCompareTree()
        else setActiveDiffTab(id)
      }}
      onClose={(id) => requestCloseDiffTabs([id])}
      onContextMenu={buildActions}
    />
  )
}
