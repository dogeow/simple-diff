import { useCallback } from 'react'
import { resolveSourcePath } from '@shared/source-path'
import { useCompareStore } from '../stores/compare-store'
import { useAppStore, type DiffTab } from '../stores/app-store'
import CompareSessionTabs from '../components/CompareSessionTabs'
import type { CompareEntry } from '../../../shared/types'
import { useCompareActions } from '../hooks/useCompare'
import { openCompareTab, openDirectoryCompareHome } from '../utils/compare-session-navigation'
import { useLogStore } from '../stores/log-store'
import { isFilterAdditionOnly } from '../utils/filter-change'
import { loadDiffTabContents } from '../utils/diff-tab-loader'
import { showToast } from '../stores/toast-store'
import ComparePageContent from '../components/ComparePageContent'
import DiffTabStrip from '../components/DiffTabStrip'
import { CompareErrorBanner, CompareStatusIndicator } from '../components/ComparePageStatus'

function createDiffTabSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
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
    const previousFilters = useCompareStore.getState().extensionFilter
    useCompareStore.getState().setExtensionFilter(nextFilters)
    const activeTabId = useAppStore.getState().activeCompareTabId
    if (activeTabId) {
      useAppStore.getState().updateCompareTabSnapshot(activeTabId, () => useCompareStore.getState().createTabSnapshot())
    }

    if (isFilterAdditionOnly(previousFilters, nextFilters)) {
      return
    }

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
      snapshot: useCompareStore.getState().createTabSnapshot(),
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
        hasLeftFile: Boolean(entry.left),
        hasRightFile: Boolean(entry.right),
        leftSource: leftSource ?? null,
        rightSource: rightSource ?? null,
        leftFullPath,
        rightFullPath,
        leftContent: '',
        rightContent: '',
        originalLeftContent: '',
        originalRightContent: '',
        diffResult: null,
        loadError: null,
        loading: true,
      }
      addDiffTab(newTab)

      const loaded = await loadDiffTabContents({
        leftSource: leftSource ?? null,
        rightSource: rightSource ?? null,
        leftFullPath,
        rightFullPath,
        readLeft: Boolean(entry.left && leftSource),
        readRight: Boolean(entry.right && rightSource),
      })

      if (!useAppStore.getState().hasDiffTabSession(tabId, sessionId)) {
        return
      }

      updateDiffTab(tabId, {
        leftContent: loaded.leftContent,
        rightContent: loaded.rightContent,
        originalLeftContent: loaded.leftContent,
        originalRightContent: loaded.rightContent,
        diffResult: loaded.diffResult,
        loadError: loaded.loadError,
        loading: false,
      })

      if (loaded.loadError) {
        showToast({
          tone: 'error',
          message: '文件内容读取失败',
          description: entry.name,
        })
      }
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
        <ComparePageContent
          onDoubleClickFile={handleDoubleClickFile}
          onRerunCompare={handleRerunCompare}
          onExtensionFilterChange={handleExtensionFilterChange}
          onSourcePathSubmit={handleSourcePathSubmit}
        />
      </div>
    </div>
  )
}
