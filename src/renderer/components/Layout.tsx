import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { useAppStore, type Page } from '../stores/app-store'
import { leaveComparePage, openCompareTab } from '../utils/compare-session-navigation'
import LogPanel from './LogPanel'
import CommandPalette from './CommandPalette'
import ShortcutHelp from './ShortcutHelp'
import ToastContainer from './ToastContainer'
import GlobalRunningIndicator from './GlobalRunningIndicator'
import { CompareIcon, FolderIcon, HistoryIcon, ServerIcon, SettingsIcon, TextIcon } from './Icons'

interface LayoutProps {
  readonly children: ReactNode
}

interface NavItem {
  readonly page: Page
  readonly label: string
  readonly Icon: ComponentType<{ width?: number; height?: number; className?: string }>
}

const NAV_ITEMS: readonly NavItem[] = [
  { page: 'home', label: '目录对比', Icon: FolderIcon },
  { page: 'text', label: '文本对比', Icon: TextIcon },
  { page: 'ssh', label: 'SSH管理', Icon: ServerIcon },
  { page: 'history', label: '历史', Icon: HistoryIcon },
  { page: 'settings', label: '设置', Icon: SettingsIcon },
]

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export default function Layout({ children }: LayoutProps) {
  const page = useAppStore((s) => s.page)
  const setPage = useAppStore((s) => s.setPage)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const handleNavigate = (nextPage: Page) => {
    if ((page === 'home' || page === 'compare') && nextPage === 'home') {
      if (page === 'compare') {
        leaveComparePage('home')
      } else {
        setPage('home')
      }
      return
    }

    if (page !== 'home' && page !== 'compare' && nextPage === 'home') {
      if (!openCompareTab(undefined, { expandLogs: true })) {
        setPage('home')
      }
      return
    }

    if (page === 'compare' && nextPage !== 'compare') {
      leaveComparePage(nextPage)
      return
    }

    setPage(nextPage)
  }

  const isNavItemActive = useCallback((itemPage: Page): boolean => {
    if (itemPage === 'home') {
      return page === 'home' || page === 'compare'
    }

    return page === itemPage
  }, [page])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
        setShortcutsOpen(false)
        return
      }

      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault()
        setShortcutsOpen((open) => !open)
        setPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex h-screen flex-col bg-neutral-900 text-neutral-100">
      <header className="app-drag-region flex h-11 shrink-0 items-center gap-3 border-b border-neutral-800 bg-neutral-850 px-3">
        <div className="flex items-center gap-2 pl-12 pr-1 text-sm font-semibold text-neutral-200">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-sm">
            <CompareIcon width={14} height={14} />
          </span>
          <span className="tracking-tight">Simple Diff</span>
        </div>
        <nav className="flex items-center gap-0.5">
          {NAV_ITEMS.map(({ page: itemPage, label, Icon }) => {
            const active = isNavItemActive(itemPage)
            return (
              <button
                key={itemPage}
                onClick={() => handleNavigate(itemPage)}
                className={`group relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-neutral-700/80 text-white'
                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                }`}
              >
                <Icon width={13} height={13} className={active ? 'text-blue-300' : 'text-neutral-500 group-hover:text-neutral-300'} />
                {label}
              </button>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <GlobalRunningIndicator />
          <button
            onClick={() => setPaletteOpen(true)}
            title="命令面板 (⌘K)"
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800/60 px-2 py-1 text-[11px] text-neutral-400 transition-colors hover:border-neutral-600 hover:bg-neutral-800 hover:text-neutral-200"
          >
            <span>跳转</span>
            <kbd className="rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 font-mono text-[10px] text-neutral-400">⌘K</kbd>
          </button>
          <button
            onClick={() => setShortcutsOpen(true)}
            title="快捷键帮助 (?)"
            aria-label="快捷键帮助"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800/60 text-[11px] font-semibold text-neutral-400 transition-colors hover:border-neutral-600 hover:bg-neutral-800 hover:text-neutral-200"
          >
            ?
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
      <LogPanel />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ToastContainer />
    </div>
  )
}
