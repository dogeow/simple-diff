import type { ReactNode } from 'react'
import { useAppStore, type Page } from '../stores/app-store'
import { useCompareStore } from '../stores/compare-store'
import LogPanel from './LogPanel'

interface LayoutProps {
  readonly children: ReactNode
}

const NAV_ITEMS: { page: Page; label: string }[] = [
  { page: 'home', label: '对比' },
  { page: 'ssh', label: 'SSH管理' },
  { page: 'history', label: '历史' },
]

export default function Layout({ children }: LayoutProps) {
  const page = useAppStore((s) => s.page)
  const setPage = useAppStore((s) => s.setPage)
  const hasCompareResult = useCompareStore((s) => s.entries.length > 0 || s.scanning)

  const handleNavClick = (target: Page) => {
    if (target === 'home' && hasCompareResult) {
      setPage('compare')
    } else {
      setPage(target)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-900 text-neutral-100">
      {page !== 'compare' && (
        <header className="flex h-10 shrink-0 items-center border-b border-neutral-700 bg-neutral-800 px-4 app-drag-region">
          <nav className="flex gap-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.page}
                onClick={() => handleNavClick(item.page)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  page === item.page
                    ? 'bg-neutral-700 text-white'
                    : 'text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </header>
      )}
      <main className="flex-1 overflow-hidden">{children}</main>
      <LogPanel />
    </div>
  )
}
