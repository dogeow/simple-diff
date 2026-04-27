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
import type { CompareEntry } from '../../../shared/types'
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
    <div className="shrink-0 flex items-center gap-3 text-xs text-neutral-400">
      {activeStatusLabel && !paused && (
        <span className="flex items-center gap-1.5 text-blue-400">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {activeStatusLabel}
        </span>
      )}
      {activeStatusLabel && paused && <span className="text-amber-400">Ⅱ {activeStatusLabel}</span>}
      {!activeStatusLabel && done && <span className="text-green-400">✓ 完成 {formatDuration(duration)}</span>}
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

  if (diffTabs.length === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-3 border-b border-neutral-700 bg-neutral-900/70 px-3 py-2">
      <div className="flex gap-0.5 overflow-x-auto">
        <button
          onClick={() => setActiveDiffTab(null)}
          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
            activeDiffTabId === null
              ? 'bg-neutral-800 text-white'
              : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
          }`}
        >
          目录树
        </button>
        {diffTabs.map((tab) => (
          <div key={tab.id} className="group flex items-center">
            <button
              onClick={() => setActiveDiffTab(tab.id)}
              className={`rounded-l px-3 py-1 text-xs font-medium transition-colors ${
                activeDiffTabId === tab.id
                  ? 'bg-neutral-800 text-white'
                  : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
              }`}
            >
              {tab.fileName}
              {tab.leftContent !== tab.originalLeftContent || tab.rightContent !== tab.originalRightContent
                ? ' ●'
                : ''}
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation()
                closeDiffTab(tab.id)
              }}
              className="rounded-r bg-neutral-700 px-1.5 py-1 text-xs text-neutral-400 hover:bg-neutral-600 hover:text-white"
            >
              ×
            </button>
          </div>
        ))}
      </div>
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
      <div className="flex items-center gap-3 border-b border-neutral-700 bg-neutral-800 px-3 py-2">
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
