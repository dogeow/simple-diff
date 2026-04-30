import { useState } from 'react'
import type { CompareTab } from '../stores/app-store'
import { CloseIcon, PlusIcon } from './Icons'
import FileContextMenu, { type ContextMenuAction } from './FileContextMenu'

interface CompareSessionTabsProps {
  readonly compareTabs: readonly CompareTab[]
  readonly activeCompareTabId: string | null
  readonly newCompareActive?: boolean
  readonly onSelectNewCompare: () => void
  readonly onSelectCompareTab: (compareTabId: string) => void
  readonly onCloseCompareTab?: (compareTabId: string) => void
}

interface MenuState {
  readonly x: number
  readonly y: number
  readonly tabId: string
}

export default function CompareSessionTabs({
  compareTabs,
  activeCompareTabId,
  newCompareActive = false,
  onSelectNewCompare,
  onSelectCompareTab,
  onCloseCompareTab,
}: CompareSessionTabsProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)

  const buildActions = (tabId: string): readonly ContextMenuAction[] => {
    if (!onCloseCompareTab) return []
    const target = compareTabs.find((t) => t.id === tabId)
    if (!target) return []

    const others = compareTabs.filter((t) => t.id !== tabId)
    const actions: ContextMenuAction[] = [
      { label: '关闭', onClick: () => onCloseCompareTab(tabId) },
    ]
    if (others.length > 0) {
      actions.push({
        label: '关闭其他',
        onClick: () => {
          for (const other of others) {
            onCloseCompareTab(other.id)
          }
        },
      })
      actions.push({
        label: '关闭全部',
        danger: true,
        onClick: () => {
          for (const tab of compareTabs) {
            onCloseCompareTab(tab.id)
          }
        },
      })
    }
    return actions
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <button
        onClick={onSelectNewCompare}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
          newCompareActive
            ? 'bg-blue-600 text-white shadow-sm'
            : 'border border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800'
        }`}
      >
        <PlusIcon width={12} height={12} />
        新建对比
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {compareTabs.map((tab) => {
          const isActive = !newCompareActive && activeCompareTabId === tab.id

          return (
            <div key={tab.id} className="group flex shrink-0 items-center">
              <button
                onClick={() => onSelectCompareTab(tab.id)}
                onContextMenu={(event) => {
                  if (!onCloseCompareTab) return
                  event.preventDefault()
                  setMenu({ x: event.clientX, y: event.clientY, tabId: tab.id })
                }}
                title={tab.title}
                className={`relative max-w-56 truncate px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-neutral-800 text-white'
                    : 'bg-neutral-800/60 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                } ${onCloseCompareTab ? 'rounded-l-md' : 'rounded-md'}`}
              >
                {isActive && (
                  <span className="absolute inset-x-2 top-0 h-[2px] rounded-b-full bg-blue-500" aria-hidden="true" />
                )}
                {tab.title}
              </button>

              {onCloseCompareTab && (
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    onCloseCompareTab(tab.id)
                  }}
                  className={`inline-flex h-[26px] items-center justify-center rounded-r-md px-1.5 text-xs transition-colors ${
                    isActive
                      ? 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100'
                      : 'bg-neutral-800/60 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'
                  }`}
                  aria-label={`关闭 ${tab.title}`}
                  title={`关闭 ${tab.title}`}
                >
                  <CloseIcon width={11} height={11} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {menu && (
        <FileContextMenu
          x={menu.x}
          y={menu.y}
          actions={buildActions(menu.tabId)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
