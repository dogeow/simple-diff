import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { EllipsisVertical, Folder, FolderSync, History, Keyboard, ScrollText, Search, Server, Settings, Sun, Text } from 'lucide-react'
import { Button, DropdownMenu, IconButton, Kbd, Tabs, type MenuItem, type TabItem } from './ui'
import LogPanel from './LogPanel'
import Statusbar from './Statusbar'
import ToastContainer from './ToastContainer'
import OverlayHost from './overlays/OverlayHost'
import { useAppStore, pageToMode, type AppMode } from '../stores/app-store'
import { useUIStore } from '../stores/ui-store'
import { useLogStore } from '../stores/log-store'
import { useDiffPaletteSync, useThemeSync } from '../hooks/useThemeSync'
import { useGlobalShortcuts } from '../hooks/useGlobalShortcuts'
import { SHORTCUT } from '../hooks/shortcuts'
import { openCompareTab, persistActiveCompareTab } from '../utils/compare-session-navigation'
import { getRuntimeInfo } from '../runtime/runtime-info'
import { isTauriRuntime } from '../runtime/ensure-app-api'
import type { ThemePreference } from '../stores/settings-store'

interface AppShellProps {
  readonly children: ReactNode
}

const MODE_TABS: readonly TabItem[] = [
  { value: 'compare', label: '目录对比', icon: Folder },
  { value: 'text', label: '文本对比', icon: Text },
]

/** F10：三态偏好完整保留，`system` 不再会被顶栏按钮意外抹掉。 */
const THEME_ITEMS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

/**
 * DESIGN-SYSTEM §9 的壳层：36px 顶栏 + 内容 + 24px 状态栏，没有侧边栏
 * （这个应用的上下文树就是内容本身，再加一棵树只会重复）。
 *
 * 取代 `Layout.tsx`。顶层导航从 7 个槽位收敛到 2 个模式；SSH管理 / 历史 /
 * 同步任务 / 设置 / 快捷键 / 主题都挂在右侧的 `⋯` 应用菜单上，同时全部可以从
 * `⌘K` 打开——被降级的功能一个都没有丢（DESIGN-SYSTEM §9 规则 1）。
 */
export default function AppShell({ children }: AppShellProps) {
  const runtime = getRuntimeInfo()
  // macOS window controls share the 36px mode bar instead of adding a title row.
  const nativeTitlebar = isTauriRuntime() && typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
  const page = useAppStore((s) => s.page)
  const setPage = useAppStore((s) => s.setPage)
  const openOverlay = useUIStore((s) => s.openOverlay)
  const toggleLog = useLogStore((s) => s.toggleVisible)
  const { theme, setTheme } = useThemeSync()
  useDiffPaletteSync()
  const mode = pageToMode(page)

  const handleModeChange = useCallback((next: string) => {
    const nextMode = next as AppMode
    if (nextMode === mode) return

    if (nextMode === 'text') {
      // F4：模式切换不销毁任何东西，但要把 live 会话写回它自己的标签，
      // 这样在文本模式里读快照的地方（App 的本地监听目标、状态栏）看到的是最新值。
      persistActiveCompareTab()
      setPage('text')
      return
    }

    // “目录对比”只有一个含义：显示对比工作区。有结果就是结果态，没有就是 setup 态
    // ——两者是同一个屏幕的两种状态。旧的 `Layout.tsx:74-79` 会在两种含义间摇摆。
    openCompareTab()
  }, [mode, setPage])

  const appMenuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [
      { id: 'settings', label: '设置…', icon: Settings, shortcut: SHORTCUT.settings, onSelect: () => openOverlay('settings') },
    ]

    if (runtime.supportsHistory) {
      items.push({ id: 'history', label: '对比历史…', icon: History, onSelect: () => openOverlay('history') })
    }
    if (runtime.supportsSftp) {
      items.push({ id: 'ssh', label: 'SSH 连接管理…', icon: Server, onSelect: () => openOverlay('ssh') })
    }
    if (runtime.supportsSync) {
      items.push({ id: 'sync', label: '同步任务…', icon: FolderSync, onSelect: () => openOverlay('sync') })
    }

    items.push(
      { id: 'log', label: '日志面板', icon: ScrollText, shortcut: SHORTCUT.toggleLog, onSelect: toggleLog },
      { id: 'shortcuts', label: '快捷键…', icon: Keyboard, shortcut: SHORTCUT.shortcutHelp, onSelect: () => openOverlay('shortcuts') },
      { kind: 'separator', id: 'sep-theme' },
      {
        kind: 'submenu',
        id: 'theme',
        label: '主题',
        icon: Sun,
        items: THEME_ITEMS.map(({ value, label }) => ({
          kind: 'checkbox' as const,
          id: `theme-${value}`,
          label,
          checked: theme === value,
          onSelect: () => setTheme(value),
        })),
      },
    )

    return items
  }, [openOverlay, runtime.supportsHistory, runtime.supportsSftp, runtime.supportsSync, setTheme, theme, toggleLog])

  // 后端日志订阅必须常驻：`LogPanel` 收起时整个组件不渲染，订阅不能跟着卸载。
  useEffect(() => window.api.onLog((entry) => useLogStore.getState().addLog(entry)), [])

  // chunk 9 第 3 条：全局快捷键统一由 `hooks/useGlobalShortcuts.ts` 拥有。
  useGlobalShortcuts()

  return (
    <div className="flex h-screen flex-col bg-canvas text-fg">
      <header
        data-tauri-drag-region
        data-native-titlebar={nativeTitlebar || undefined}
        className="app-drag-region flex h-titlebar shrink-0 items-center gap-2 border-b border-border bg-surface px-2 data-[native-titlebar=true]:pl-20"
      >
        <Tabs
          aria-label="视图模式"
          variant="underline"
          size="sm"
          value={mode}
          onValueChange={handleModeChange}
          items={[...MODE_TABS]}
          className="self-stretch border-b-0"
        />
        <div data-tauri-drag-region className="h-full min-w-4 flex-1" />
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon={Search}
            onClick={() => openOverlay('palette')}
            aria-label="命令面板"
          >
            <Kbd>{SHORTCUT.palette}</Kbd>
          </Button>
          <DropdownMenu
            items={appMenuItems}
            trigger={<IconButton icon={EllipsisVertical} label="应用菜单" size="sm" variant="ghost" />}
          />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

      <LogPanel />
      <Statusbar />
      <OverlayHost />
      <ToastContainer />
    </div>
  )
}
