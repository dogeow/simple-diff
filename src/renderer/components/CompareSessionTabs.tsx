import { useState } from 'react'
import type { CompareTab } from '../stores/app-store'
import { CloseIcon, PlusIcon } from './Icons'
import FileContextMenu, { type ContextMenuAction } from './FileContextMenu'

const ACTIVE_TAB_BUTTON = 'bg-blue-600 text-white hover:bg-blue-500'
const ACTIVE_TAB_CLOSE = 'bg-blue-600 text-blue-100 hover:bg-blue-500 hover:text-white'

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
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
          newCompareActive
            ? ACTIVE_TAB_BUTTON
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
            <div key={tab.id} className="group flex h-8 shrink-0 items-stretch">
              <button
                onClick={() => onSelectCompareTab(tab.id)}
                onContextMenu={(event) => {
                  if (!onCloseCompareTab) return
                  event.preventDefault()
                  setMenu({ x: event.clientX, y: event.clientY, tabId: tab.id })
                }}
                title={tab.title}
                className={`relative inline-flex h-8 max-w-56 items-center truncate px-3 text-xs font-medium transition-colors ${
                  isActive
                    ? ACTIVE_TAB_BUTTON
                    : 'bg-neutral-800/60 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                } ${onCloseCompareTab ? 'rounded-l-md' : 'rounded-md'}`}
              >
                {tab.title}
              </button>

              {onCloseCompareTab && (
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    onCloseCompareTab(tab.id)
                  }}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-r-md text-xs transition-colors ${
                    isActive
                      ? ACTIVE_TAB_CLOSE
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
