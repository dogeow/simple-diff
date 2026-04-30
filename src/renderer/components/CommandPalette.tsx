import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore, type Page } from '../stores/app-store'
import { useLogStore } from '../stores/log-store'
import { leaveComparePage, openCompareTab, openDirectoryCompareHome } from '../utils/compare-session-navigation'
import {
  CompareIcon,
  FolderIcon,
  HistoryIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  ServerIcon,
  SettingsIcon,
  TextIcon,
  TrashIcon,
} from './Icons'
import Modal from './Modal'

interface CommandPaletteProps {
  readonly open: boolean
  readonly onClose: () => void
}

interface CommandItem {
  readonly id: string
  readonly title: string
  readonly hint?: string
  readonly Icon: typeof FolderIcon
  readonly keywords: string
  readonly onSelect: () => void
}

const PAGE_LABELS: Record<Page, string> = {
  home: '目录对比',
  compare: '对比结果',
  text: '文本对比',
  ssh: 'SSH 管理',
  history: '历史',
  settings: '设置',
}

function matches(query: string, keywords: string): boolean {
  if (!query) return true
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const haystack = keywords.toLowerCase()
  return tokens.every((token) => haystack.includes(token))
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const { compareTabs, currentPage } = useAppStore(useShallow((s) => ({
    compareTabs: s.compareTabs,
    currentPage: s.page,
  })))
  const logVisible = useLogStore((s) => s.visible)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const items: readonly CommandItem[] = useMemo(() => {
    const navigate = (page: Page) => {
      if (page === 'home') {
        if (currentPage === 'compare') {
          leaveComparePage('home')
        } else if (currentPage !== 'home' && currentPage !== 'compare') {
          if (!openCompareTab(undefined, { expandLogs: true })) {
            useAppStore.getState().setPage('home')
          }
        } else {
          useAppStore.getState().setPage('home')
        }
        return
      }
      if (currentPage === 'compare' && page !== 'compare') {
        leaveComparePage(page)
        return
      }
      useAppStore.getState().setPage(page)
    }

    const navItems: CommandItem[] = [
      {
        id: 'nav-home',
        title: PAGE_LABELS.home,
        hint: '主页',
        Icon: FolderIcon,
        keywords: 'home directory compare 目录对比 home 主页',
        onSelect: () => navigate('home'),
      },
      {
        id: 'nav-text',
        title: PAGE_LABELS.text,
        hint: '比对粘贴或拖入的文本',
        Icon: TextIcon,
        keywords: 'text compare 文本对比',
        onSelect: () => navigate('text'),
      },
      {
        id: 'nav-ssh',
        title: PAGE_LABELS.ssh,
        hint: '管理 SFTP 连接',
        Icon: ServerIcon,
        keywords: 'ssh sftp 管理 连接',
        onSelect: () => navigate('ssh'),
      },
      {
        id: 'nav-history',
        title: PAGE_LABELS.history,
        hint: '查看过往对比记录',
        Icon: HistoryIcon,
        keywords: 'history 历史 记录',
        onSelect: () => navigate('history'),
      },
      {
        id: 'nav-settings',
        title: PAGE_LABELS.settings,
        hint: '全局过滤等',
        Icon: SettingsIcon,
        keywords: 'settings 设置 配置',
        onSelect: () => navigate('settings'),
      },
    ]

    const newCompareItem: CommandItem = {
      id: 'action-new-compare',
      title: '新建目录对比',
      hint: '回到主页输入路径',
      Icon: PlusIcon,
      keywords: 'new compare 新建对比',
      onSelect: () => openDirectoryCompareHome(),
    }

    const tabItems: CommandItem[] = compareTabs.map((tab) => ({
      id: `tab-${tab.id}`,
      title: tab.title,
      hint: '切换到此对比标签',
      Icon: CompareIcon,
      keywords: `tab ${tab.title} compare 对比 切换`,
      onSelect: () => openCompareTab(tab.id, { expandLogs: false }),
    }))

    const logItems: CommandItem[] = [
      {
        id: 'action-log-toggle',
        title: logVisible ? '收起日志面板' : '展开日志面板',
        hint: '位于窗口底部',
        Icon: RefreshIcon,
        keywords: 'log 日志 toggle 切换 开关',
        onSelect: () => useLogStore.getState().toggleVisible(),
      },
      {
        id: 'action-log-clear',
        title: '清空日志',
        hint: '移除所有已捕获的条目',
        Icon: TrashIcon,
        keywords: 'log 日志 clear 清空 清除',
        onSelect: () => useLogStore.getState().clear(),
      },
    ]

    return [...navItems, newCompareItem, ...tabItems, ...logItems]
  }, [compareTabs, currentPage, logVisible])

  const filtered = useMemo(
    () => items.filter((item) => matches(query, `${item.title} ${item.keywords}`)),
    [items, query],
  )

  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(filtered.length === 0 ? 0 : filtered.length - 1)
    }
  }, [activeIndex, filtered.length])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((idx) => Math.min(filtered.length - 1, idx + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((idx) => Math.max(0, idx - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = filtered[activeIndex]
      if (item) {
        item.onSelect()
        onClose()
      }
    }
  }

  return (
    <Modal open={open} onClose={onClose} ariaLabel="命令面板" maxWidth="max-w-xl">
      <div className="flex items-center gap-2 border-b border-neutral-700 px-3 py-3">
        <SearchIcon width={14} height={14} className="shrink-0 text-neutral-500" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={handleKeyDown}
          placeholder="跳转页面、切换对比标签..."
          className="flex-1 border-0 bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
        />
        <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">ESC</kbd>
      </div>
      <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1.5">
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-neutral-500">无匹配结果</div>
        )}
        {filtered.map((item, index) => {
          const Icon = item.Icon
          const active = index === activeIndex
          return (
            <button
              key={item.id}
              data-index={index}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                item.onSelect()
                onClose()
              }}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                active ? 'bg-blue-600/20 text-blue-100' : 'text-neutral-200 hover:bg-neutral-800/70'
              }`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${active ? 'bg-blue-500/25 text-blue-200' : 'bg-neutral-800 text-neutral-400'}`}>
                <Icon width={13} height={13} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.title}</span>
                {item.hint && <span className="block truncate text-xs text-neutral-500">{item.hint}</span>}
              </span>
              {active && (
                <kbd className="ml-2 shrink-0 rounded border border-blue-400/40 bg-blue-500/20 px-1.5 py-0.5 font-mono text-[10px] text-blue-200">↵</kbd>
              )}
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-neutral-800 bg-neutral-900/40 px-3 py-1.5 text-[11px] text-neutral-500">
        <span className="inline-flex items-center gap-1.5">
          <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 font-mono text-[10px]">↑↓</kbd>
          导航
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 font-mono text-[10px]">↵</kbd>
          选择
        </span>
        <span className="inline-flex items-center gap-1.5">
          按
          <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 font-mono text-[10px]">?</kbd>
          查看快捷键
        </span>
      </div>
    </Modal>
  )
}
