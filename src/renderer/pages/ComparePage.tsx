import { useCallback } from 'react'
import { resolveSourcePath } from '@shared/source-path'
import { formatDuration } from '@shared/format-duration'
import { useShallow } from 'zustand/react/shallow'
import { useCompareStore } from '../stores/compare-store'
import { useAppStore, type DiffTab } from '../stores/app-store'
import CompareSessionTabs from '../components/CompareSessionTabs'
import CompareTree from '../components/CompareTree'
import SplitTree from '../components/SplitTree'
import FileDiffView from '../components/FileDiffView'
import FileContextMenu, { type ContextMenuAction } from '../components/FileContextMenu'
import type { CompareEntry } from '../../../shared/types'
import { useState } from 'react'
import { useCompareActions } from '../hooks/useCompare'
import { openCompareTab, openDirectoryCompareHome } from '../utils/compare-session-navigation'
import { useLogStore } from '../stores/log-store'

function createDiffTabSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

function CompareStatusIndicator() {
  const scanning = useCompareStore((s) => s.scanning)
  const comparing = useCompareStore((s) => s.comparing)
  const paused = useCompareStore((s) => s.paused)
  const done = useCompareStore((s) => s.done)
  const duration = useCompareStore((s) => s.duration)

  const activeStatusLabel = scanning && comparing
    ? '扫描并对比中…'
    : scanning
      ? '扫描中…'
      : comparing
        ? '对比中…'
        : paused
          ? '已暂停'
          : null

  if (!activeStatusLabel && !done) {
    return null
  }

  return (
    <div className="shrink-0 flex items-center gap-3 text-xs">
      {activeStatusLabel && !paused && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2 py-0.5 font-medium text-blue-300">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {activeStatusLabel}
        </span>
      )}
      {activeStatusLabel && paused && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-0.5 font-medium text-amber-300">
          <span className="inline-flex h-2 w-2 items-center justify-center">
            <span className="h-2 w-0.5 bg-current" />
            <span className="ml-0.5 h-2 w-0.5 bg-current" />
          </span>
          {activeStatusLabel}
        </span>
      )}
      {!activeStatusLabel && done && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-300">
          <span aria-hidden="true">✓</span>
          完成 {formatDuration(duration)}
        </span>
      )}
    </div>
  )
}

function CompareErrorBanner() {
  const error = useCompareStore((s) => s.error)

  if (!error) {
    return null
  }

  return (
    <div className="mx-3 mt-2 rounded-md border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-300" role="alert">
      {error}
    </div>
  )
}

interface CompareContentProps {
  readonly onDoubleClickFile: (entry: CompareEntry) => void
  readonly onRerunCompare: () => Promise<void>
  readonly onExtensionFilterChange: (nextFilters: readonly string[]) => Promise<void>
  readonly onSourcePathSubmit: (side: 'left' | 'right', nextPath: string) => Promise<void>
}

function DirectoryCompareContent({
  onDoubleClickFile,
  onRerunCompare,
  onExtensionFilterChange,
  onSourcePathSubmit,
}: CompareContentProps) {
  const entries = useCompareStore((s) => s.entries)
  const scanning = useCompareStore((s) => s.scanning)
  const filter = useCompareStore((s) => s.filter)
  const setFilter = useCompareStore((s) => s.setFilter)
  const viewMode = useCompareStore((s) => s.viewMode)

  const emptyStateMessage = scanning ? '正在扫描目录，等待首批目录…' : '无匹配项'

  if (viewMode === 'split') {
    return (
      <div className="h-full p-3">
        <div className="flex h-full flex-col gap-2">
          <CompareTree
            entries={entries}
            filter={filter}
            onFilterChange={setFilter}
            onDoubleClickFile={onDoubleClickFile}
            toolbarOnly
            onRerunCompare={onRerunCompare}
            onExtensionFilterChange={onExtensionFilterChange}
          />
          <SplitTree
            entries={entries}
            filter={filter}
            onDoubleClickFile={onDoubleClickFile}
            emptyStateMessage={emptyStateMessage}
            onExtensionFilterChange={onExtensionFilterChange}
            onSourcePathSubmit={onSourcePathSubmit}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full p-3">
      <CompareTree
        entries={entries}
        filter={filter}
        onFilterChange={setFilter}
        onDoubleClickFile={onDoubleClickFile}
        emptyStateMessage={emptyStateMessage}
        onRerunCompare={onRerunCompare}
        onExtensionFilterChange={onExtensionFilterChange}
      />
    </div>
  )
}

function ActiveDiffContent() {
  const activeTab = useAppStore((s) => {
    if (s.activeDiffTabId === null) {
      return null
    }

    return s.diffTabs.find((tab) => tab.id === s.activeDiffTabId) ?? null
  })

  if (!activeTab) {
    return null
  }

  return <FileDiffView tab={activeTab} />
}

function CompareContent(props: CompareContentProps) {
  const hasActiveDiffTab = useAppStore((s) => s.activeDiffTabId !== null)

  if (hasActiveDiffTab) {
    return <ActiveDiffContent />
  }

  return <DirectoryCompareContent {...props} />
}

function DiffTabStrip() {
  const { diffTabs, activeDiffTabId, closeDiffTab, setActiveDiffTab } = useAppStore(useShallow((s) => ({
    diffTabs: s.diffTabs,
    activeDiffTabId: s.activeDiffTabId,
    closeDiffTab: s.closeDiffTab,
    setActiveDiffTab: s.setActiveDiffTab,
  })))
  const [menu, setMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)

  const handleCloseTab = (tabId: string) => {
    const tab = diffTabs.find((candidate) => candidate.id === tabId)
    if (!tab) return
    const isModified = tab.leftContent !== tab.originalLeftContent || tab.rightContent !== tab.originalRightContent
    if (isModified) {
      const confirmed = window.confirm(`"${tab.fileName}" 有未保存的修改，确定关闭？`)
      if (!confirmed) return
    }
    closeDiffTab(tabId)
  }

  const buildActions = (tabId: string): readonly ContextMenuAction[] => {
    const target = diffTabs.find((t) => t.id === tabId)
    if (!target) return []

    const others = diffTabs.filter((t) => t.id !== tabId)
    const actions: ContextMenuAction[] = [
      { label: '关闭', onClick: () => handleCloseTab(tabId) },
    ]
    if (others.length > 0) {
      actions.push({
        label: '关闭其他',
        onClick: () => {
          for (const other of others) {
            handleCloseTab(other.id)
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
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            activeDiffTabId === null
              ? 'bg-neutral-700/70 text-white shadow-inner'
              : 'border border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800'
          }`}
        >
          目录树
        </button>
        {diffTabs.map((tab) => {
          const isActive = activeDiffTabId === tab.id
          const isModified = tab.leftContent !== tab.originalLeftContent || tab.rightContent !== tab.originalRightContent
          return (
            <div key={tab.id} className="group flex items-center">
              <button
                onClick={() => setActiveDiffTab(tab.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setMenu({ x: event.clientX, y: event.clientY, tabId: tab.id })
                }}
                title={tab.fileName}
                className={`inline-flex max-w-56 items-center gap-1.5 rounded-l-md px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-neutral-700/70 text-white'
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
                className={`inline-flex h-[26px] w-[22px] items-center justify-center rounded-r-md text-neutral-400 transition-colors ${
                  isActive
                    ? 'bg-neutral-700/70 hover:bg-neutral-700 hover:text-white'
                    : 'border border-l-0 border-neutral-700 bg-neutral-800/60 hover:bg-neutral-800 hover:text-white'
                }`}
              >
                <span aria-hidden="true">×</span>
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

export default function ComparePage() {
  const leftSource = useCompareStore((s) => s.leftSource)
  const rightSource = useCompareStore((s) => s.rightSource)
  const resetCompare = useCompareStore((s) => s.resetCompare)
  const setPage = useAppStore((s) => s.setPage)
  const compareTabs = useAppStore((s) => s.compareTabs)
  const activeCompareTabId = useAppStore((s) => s.activeCompareTabId)
  const addDiffTab = useAppStore((s) => s.addDiffTab)
  const updateDiffTab = useAppStore((s) => s.updateDiffTab)
  const replaceDiffTabs = useAppStore((s) => s.replaceDiffTabs)
  const closeCompareTab = useAppStore((s) => s.closeCompareTab)
  const setActiveCompareTab = useAppStore((s) => s.setActiveCompareTab)
  const clearDiffTabs = useAppStore((s) => s.clearDiffTabs)
  const { restartCompare } = useCompareActions()

  const handleRerunCompare = useCallback(async () => {
    await restartCompare()
  }, [restartCompare])

  const handleExtensionFilterChange = useCallback(async (nextFilters: readonly string[]) => {
    useCompareStore.getState().setExtensionFilter(nextFilters)
    await handleRerunCompare()
  }, [handleRerunCompare])

  const handleSelectCompareTab = useCallback(async (compareTabId: string) => {
    if (compareTabId === activeCompareTabId) {
      useLogStore.getState().setVisible(true)
      return
    }

    useAppStore.getState().saveCompareTab({
      id: activeCompareTabId ?? compareTabId,
      title: compareTabs.find((tab) => tab.id === activeCompareTabId)?.title ?? '未命名对比',
      snapshot: useCompareStore.getState().createSnapshot(),
      diffTabs: useAppStore.getState().diffTabs,
      activeDiffTabId: useAppStore.getState().activeDiffTabId,
    })

    const targetCompareTab = useAppStore.getState().compareTabs.find((tab) => tab.id === compareTabId)
    if (!targetCompareTab) return

    openCompareTab(compareTabId, { expandLogs: true })
  }, [activeCompareTabId, compareTabs])

  const handleSourcePathSubmit = useCallback(async (side: 'left' | 'right', nextPath: string) => {
    const compareState = useCompareStore.getState()

    if (compareState.activeCompareId && (compareState.scanning || compareState.comparing)) {
      await window.api.cancelCompare(compareState.activeCompareId)
    }

    if (side === 'left') {
      compareState.setLeftPath(nextPath)
    } else {
      compareState.setRightPath(nextPath)
    }

    compareState.invalidateCompareResult()
    clearDiffTabs()
    useLogStore.getState().setVisible(true)
  }, [clearDiffTabs])

  const handleCloseCompareSession = useCallback(async (compareTabId: string) => {
    const appState = useAppStore.getState()
    const targetCompareTab = appState.compareTabs.find((tab) => tab.id === compareTabId)
    const isActive = appState.activeCompareTabId === compareTabId

    if (targetCompareTab?.snapshot.activeCompareId && (targetCompareTab.snapshot.scanning || targetCompareTab.snapshot.comparing)) {
      await window.api.cancelCompare(targetCompareTab.snapshot.activeCompareId)
    }

    if (!isActive) {
      closeCompareTab(compareTabId)
      return
    }

    const remainingTabs = appState.compareTabs.filter((tab) => tab.id !== compareTabId)
    closeCompareTab(compareTabId)

    if (remainingTabs.length === 0) {
      replaceDiffTabs([], null)
      resetCompare()
      setPage('home')
      return
    }

    const nextCompareTab = remainingTabs[remainingTabs.length - 1]
    useCompareStore.getState().restoreSnapshot(nextCompareTab.snapshot)
    replaceDiffTabs(nextCompareTab.diffTabs, nextCompareTab.activeDiffTabId)
    setActiveCompareTab(nextCompareTab.id)
  }, [closeCompareTab, replaceDiffTabs, resetCompare, setActiveCompareTab, setPage])

  const handleDoubleClickFile = useCallback(
    async (entry: CompareEntry) => {
      if (!leftSource && !rightSource) return

      const leftRoot = leftSource?.path ?? ''
      const rightRoot = rightSource?.path ?? ''

      const leftFullPath = entry.left && leftSource ? resolveSourcePath(leftSource, entry.relativePath) : leftRoot
      const rightFullPath = entry.right && rightSource ? resolveSourcePath(rightSource, entry.relativePath) : rightRoot

      const tabId = entry.relativePath

      // Check if tab already open
      const existing = useAppStore.getState().diffTabs.find((tab) => tab.id === tabId)
      if (existing) {
        useAppStore.getState().setActiveDiffTab(tabId)
        return
      }

      const sessionId = createDiffTabSessionId()

      // Create loading tab
      const newTab: DiffTab = {
        id: tabId,
        sessionId,
        relativePath: entry.relativePath,
        fileName: entry.name,
        leftSource: leftSource ?? null,
        rightSource: rightSource ?? null,
        leftFullPath,
        rightFullPath,
        leftContent: '',
        rightContent: '',
        originalLeftContent: '',
        originalRightContent: '',
        diffResult: null,
        loading: true,
      }
      addDiffTab(newTab)

      // Read file contents
      let leftContent = ''
      let rightContent = ''

      if (entry.left && leftSource) {
        const res = await window.api.readText(leftSource, leftFullPath)
        if (res.success && res.data != null) leftContent = res.data
      }

      if (entry.right && rightSource) {
        const res = await window.api.readText(rightSource, rightFullPath)
        if (res.success && res.data != null) rightContent = res.data
      }

      // Compute diff
      const diffRes = await window.api.textDiff(leftContent, rightContent)

      if (!useAppStore.getState().hasDiffTabSession(tabId, sessionId)) {
        return
      }

      updateDiffTab(tabId, {
        leftContent,
        rightContent,
        originalLeftContent: leftContent,
        originalRightContent: rightContent,
        diffResult: diffRes.success ? diffRes.data : null,
        loading: false,
      })
    },
    [leftSource, rightSource, addDiffTab, updateDiffTab],
  )

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-850 px-3 py-2">
        <CompareSessionTabs
          compareTabs={compareTabs}
          activeCompareTabId={activeCompareTabId}
          onSelectNewCompare={() => openDirectoryCompareHome()}
          onSelectCompareTab={(compareTabId) => {
            void handleSelectCompareTab(compareTabId)
          }}
          onCloseCompareTab={(compareTabId) => {
            void handleCloseCompareSession(compareTabId)
          }}
        />

        {/* Status indicator */}
        <CompareStatusIndicator />
      </div>

      <CompareErrorBanner />

      <DiffTabStrip />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <CompareContent
          onDoubleClickFile={handleDoubleClickFile}
          onRerunCompare={handleRerunCompare}
          onExtensionFilterChange={handleExtensionFilterChange}
          onSourcePathSubmit={handleSourcePathSubmit}
        />
      </div>
    </div>
  )
}
