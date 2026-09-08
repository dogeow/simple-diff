import SyncConfirmDialog from './SyncConfirmDialog'
import CommandPalette from '../CommandPalette'
import ShortcutHelp from '../ShortcutHelp'
import CompareSetupDialog from '../compare/CompareSetupDialog'
import StrategyDocDialog from '../compare/StrategyDocDialog'
import SettingsDialog from './SettingsDialog'
import HistoryDialog from './HistoryDialog'
import SSHManagerDialog from './SSHManagerDialog'
import SyncDrawer from './SyncDrawer'
import DiffTabCloseConfirm from './DiffTabCloseConfirm'
import UnsavedChangesDialog from './UnsavedChangesDialog'
import { useUIStore, type OverlayKind } from '../../stores/ui-store'

/**
 * 设计蓝图 §2.3：SSH管理 / 历史 / 同步任务 / 设置 从顶层导航槽位降级为叠加层。
 *
 * chunk 8 完成了这次搬家的第二步——里面装的不再是原来的页面组件，而是四个真正的
 * 叠加层（`SettingsDialog` / `HistoryDialog` / `SSHManagerDialog` / `SyncDrawer`），
 * 四个 `pages/*` 文件已经删除。开合状态仍然统一放在 `ui-store`，`⌘K` 才能打开任意
 * 一个（DESIGN-SYSTEM §9 规则 1：被降级 ≠ 被删除）。
 */
export default function OverlayHost() {
  const overlay = useUIStore((state) => state.overlay)
  const closeOverlay = useUIStore((state) => state.closeOverlay)

  const bind = (kind: OverlayKind) => ({
    open: overlay === kind,
    onOpenChange: (open: boolean) => {
      if (!open) closeOverlay()
    },
  })

  return (
    <>
      {/*
        命令面板只在打开时挂载：`useCommands()` 订阅了半个 compare store，常驻挂载会让
        流式扫描期间的每一条 entry 都触发一次叠加层宿主重渲染（chunk 9）。
      */}
      {overlay === 'palette' && <CommandPalette open onClose={closeOverlay} />}
      <ShortcutHelp open={overlay === 'shortcuts'} onClose={closeOverlay} />
      {/* F3：编辑数据源与 setup 态共用 `CompareSetupPanel`，开合状态和其他叠加层同源。 */}
      <CompareSetupDialog {...bind('compare-setup')} />
      <SettingsDialog {...bind('settings')} />
      <HistoryDialog {...bind('history')} />
      <SSHManagerDialog {...bind('ssh')} />
      <SyncDrawer {...bind('sync')} />
      {/* 工具栏 `⋯ → 对比策略说明…` 与 `⌘K` 共用同一个开合状态。 */}
      <StrategyDocDialog {...bind('strategy-doc')} />
      {/*
        关闭脏标签的确认。它不占 `overlay` 槽位：可能在任意一个叠加层之上叠出来
        （比如从 `⌘K` 里关标签），`useDismiss` 的层级栈保证 Esc 只剥掉最上面一层。
      */}
      <DiffTabCloseConfirm />
      <UnsavedChangesDialog />
      <SyncConfirmDialog />
    </>
  )
}
