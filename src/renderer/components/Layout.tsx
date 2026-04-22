import type { ReactNode } from 'react'
import { useAppStore, type Page } from '../stores/app-store'
import { leaveComparePage, openCompareTab } from '../utils/compare-session-navigation'
import LogPanel from './LogPanel'

interface LayoutProps {
  readonly children: ReactNode
}

const NAV_ITEMS: { page: Page; label: string }[] = [
  { page: 'home', label: '目录对比' },
  { page: 'text', label: '文本对比' },
  { page: 'ssh', label: 'SSH管理' },
  { page: 'history', label: '历史' },
  { page: 'settings', label: '设置' },
]

export default function Layout({ children }: LayoutProps) {
  const page = useAppStore((s) => s.page)
  const setPage = useAppStore((s) => s.setPage)

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

  const isNavItemActive = (itemPage: Page): boolean => {
    if (itemPage === 'home') {
      return page === 'home' || page === 'compare'
    }

    return page === itemPage
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-900 text-neutral-100">
      <header className="flex h-10 shrink-0 items-center border-b border-neutral-700 bg-neutral-800 px-4 app-drag-region">
        <nav className="flex gap-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.page}
              onClick={() => handleNavigate(item.page)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                isNavItemActive(item.page)
                  ? 'bg-neutral-700 text-white'
                  : 'text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
      <LogPanel />
    </div>
  )
}
