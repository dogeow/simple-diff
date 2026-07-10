import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../stores/app-store'
import FileContextMenu, { type ContextMenuAction } from './FileContextMenu'
import { CloseIcon } from './Icons'

const ACTIVE_DIFF_TAB_BUTTON = 'bg-blue-600 text-white hover:bg-blue-500'
const ACTIVE_DIFF_TAB_CLOSE = 'bg-blue-600 text-blue-100 hover:bg-blue-500 hover:text-white'

export default function DiffTabStrip() {
  const { diffTabs, activeDiffTabId, closeDiffTab, setActiveDiffTab } = useAppStore(useShallow((state) => ({
    diffTabs: state.diffTabs,
    activeDiffTabId: state.activeDiffTabId,
    closeDiffTab: state.closeDiffTab,
    setActiveDiffTab: state.setActiveDiffTab,
  })))
  const [menu, setMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)

  const handleCloseTab = (tabId: string) => {
    const tab = diffTabs.find((candidate) => candidate.id === tabId)
    if (!tab) return

    const isModified = tab.leftContent !== tab.originalLeftContent || tab.rightContent !== tab.originalRightContent
    if (isModified && !window.confirm(`"${tab.fileName}" 有未保存的修改，确定关闭？`)) {
      return
    }

    closeDiffTab(tabId)
  }

  const buildActions = (tabId: string): readonly ContextMenuAction[] => {
    const target = diffTabs.find((tab) => tab.id === tabId)
    if (!target) return []

    const others = diffTabs.filter((tab) => tab.id !== tabId)
    const actions: ContextMenuAction[] = [
      { label: '关闭', onClick: () => handleCloseTab(tabId) },
    ]

    if (others.length > 0) {
      actions.push({
        label: '关闭其他',
        onClick: () => {
          for (const tab of others) {
            handleCloseTab(tab.id)
          }
        },
      })
      actions.push({
        label: '关闭全部',
        danger: true,
        onClick: () => {
          for (const tab of diffTabs) {
            handleCloseTab(tab.id)
          }
        },
      })
    }

    return actions
  }

  if (diffTabs.length === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-850 px-3 py-1.5">
      <div className="flex gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveDiffTab(null)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
            activeDiffTabId === null
              ? ACTIVE_DIFF_TAB_BUTTON
              : 'border border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800'
          }`}
        >
          目录树
        </button>
        {diffTabs.map((tab) => {
          const isActive = activeDiffTabId === tab.id
          const isModified = tab.leftContent !== tab.originalLeftContent || tab.rightContent !== tab.originalRightContent

          return (
            <div key={tab.id} className="group flex h-8 items-stretch">
              <button
                onClick={() => setActiveDiffTab(tab.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setMenu({ x: event.clientX, y: event.clientY, tabId: tab.id })
                }}
                title={tab.fileName}
                className={`inline-flex h-8 max-w-56 items-center gap-1.5 rounded-l-md px-3 text-xs font-medium transition-colors ${
                  isActive
                    ? ACTIVE_DIFF_TAB_BUTTON
                    : 'border border-r-0 border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800'
                }`}
              >
                {isModified && (
                  <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-label="已修改" />
                )}
                <span className="truncate">{tab.fileName}</span>
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  handleCloseTab(tab.id)
                }}
                aria-label={`关闭 ${tab.fileName}`}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-r-md text-neutral-400 transition-colors ${
                  isActive
                    ? ACTIVE_DIFF_TAB_CLOSE
                    : 'border border-l-0 border-neutral-700 bg-neutral-800/60 hover:bg-neutral-800 hover:text-white'
                }`}
              >
                <CloseIcon width={11} height={11} />
              </button>
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
