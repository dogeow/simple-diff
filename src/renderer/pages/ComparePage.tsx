import { confirmUnsavedChanges, getSessionDiffTabs, isDiffTabDirty } from '../utils/unsaved-changes'
import { useCallback } from 'react'
import { resolveSourcePath } from '@shared/source-path'
import { hasCompareSessionContent, useCompareStore } from '../stores/compare-store'
import { useAppStore, type DiffTab } from '../stores/app-store'
import CompareSessionTabs from '../components/CompareSessionTabs'
import type { CompareEntry } from '../../../shared/types'
import { useCompareTabShortcuts } from '../hooks/useCompareTabShortcuts'
import { openCompareTab, startNewCompareSession } from '../utils/compare-session-navigation'
import { loadDiffTabContents } from '../utils/diff-tab-loader'
import { showToast } from '../stores/toast-store'
import ComparePageContent from '../components/ComparePageContent'
import CompareSetupPanel from '../components/compare/CompareSetupPanel'
import CompareToolbar from '../components/compare/CompareToolbar'
import DiffTabStrip from '../components/DiffTabStrip'
import { Toolbar } from '../components/ui'
import { useUIStore } from '../stores/ui-store'
import { useSessionFilterChange } from '../hooks/useSessionFilterChange'

function createDiffTabSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

/**
 * chunk 5：唯一的对比工作区。Home 不再是一个页面——「尚无结果」是这个标签自己的
 * `setup` 态，由 `hasCompareSessionContent()` 推导（没有新增持久化字段）。开始对比
 * 时同一个标签就地翻到 `result`，标签栏和工具栏都不动，不存在页面切换。
 */
export default function ComparePage() {
  const leftSource = useCompareStore((s) => s.leftSource)
  const rightSource = useCompareStore((s) => s.rightSource)
  const hasLiveSessionContent = useCompareStore(hasCompareSessionContent)
  const resetCompare = useCompareStore((s) => s.resetCompare)
  const compareTabs = useAppStore((s) => s.compareTabs)
  const activeCompareTabId = useAppStore((s) => s.activeCompareTabId)
  const hasActiveDiffTab = useAppStore((s) => s.activeDiffTabId !== null)
  const addDiffTab = useAppStore((s) => s.addDiffTab)
  const updateDiffTab = useAppStore((s) => s.updateDiffTab)
  const replaceDiffTabs = useAppStore((s) => s.replaceDiffTabs)
  const closeCompareTab = useAppStore((s) => s.closeCompareTab)
  const setActiveCompareTab = useAppStore((s) => s.setActiveCompareTab)
  const clearDiffTabs = useAppStore((s) => s.clearDiffTabs)
  const openOverlay = useUIStore((s) => s.openOverlay)
  // 会话过滤只有一条写入路径（工具栏弹层、树行右键『忽略』、分栏树共用）。
  const handleExtensionFilterChange = useSessionFilterChange()

  /**
   * chunk 5 第 2 条：标签的 `setup | result` 是派生的，没有新增持久化字段。
   *
   * 有活动标签就说明用户正在看那个标签——即使 `invalidateCompareResult()` 刚把结果
   * 作废（F3 的 `PathHeader` 快速改路径），它仍然是一个存在的对比标签，工具栏会显示
   * 「首次对比」。只有完全没有标签（首次启动、新建对比、关掉最后一个标签）才是 setup。
   */
  const showResult = hasLiveSessionContent
    || compareTabs.some((tab) => tab.id === activeCompareTabId)

  const handleSelectCompareTab = useCallback((compareTabId: string) => {
    // `openCompareTab` 自己负责“点当前标签是空操作”和“切换前先持久化”（F4）。
    // 这里原来还会强开日志抽屉（F9：日志只由 ⌘J、状态栏 chip 或应用菜单打开）。
    openCompareTab(compareTabId)
  }, [])

  const handleSourcePathSubmit = useCallback(async (side: 'left' | 'right', nextPath: string) => {
    if (useAppStore.getState().diffTabs.some(isDiffTabDirty) && !await confirmUnsavedChanges()) return
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
    useUIStore.getState().clearTreeSelection()
    clearDiffTabs()
  }, [clearDiffTabs])

  const handleCloseCompareSession = useCallback(async (compareTabId: string) => {
    const tabs = getSessionDiffTabs(compareTabId)
    if (tabs.some(isDiffTabDirty) && !await confirmUnsavedChanges(tabs)) return
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

    useUIStore.getState().clearTreeSelection()
    const remainingTabs = appState.compareTabs.filter((tab) => tab.id !== compareTabId)
    closeCompareTab(compareTabId)

    if (remainingTabs.length === 0) {
      // 关掉最后一个标签落回 setup 态，而不是跳去另一个页面。
      replaceDiffTabs([], null)
      resetCompare()
      useCompareStore.setState({ leftSource: null, rightSource: null })
      setActiveCompareTab(null)
      return
    }

    const nextCompareTab = remainingTabs[remainingTabs.length - 1]
    useCompareStore.getState().restoreSnapshot(nextCompareTab.snapshot)
    replaceDiffTabs(nextCompareTab.diffTabs, nextCompareTab.activeDiffTabId)
    setActiveCompareTab(nextCompareTab.id)
  }, [closeCompareTab, replaceDiffTabs, resetCompare, setActiveCompareTab])

  const handleSelectCompareTabByIndex = useCallback((index: number) => {
    const target = useAppStore.getState().compareTabs[index - 1]
    if (!target) return
    handleSelectCompareTab(target.id)
  }, [handleSelectCompareTab])

  const handleCloseActiveCompareTab = useCallback(() => {
    const targetId = useAppStore.getState().activeCompareTabId
    if (!targetId) return
    void handleCloseCompareSession(targetId)
  }, [handleCloseCompareSession])

  useCompareTabShortcuts({
    onNewCompare: startNewCompareSession,
    onSelectCompareTabByIndex: handleSelectCompareTabByIndex,
    onCloseActiveCompareTab: handleCloseActiveCompareTab,
    onEditSources: () => openOverlay('compare-setup'),
  })

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
      <CompareSessionTabs
        compareTabs={compareTabs}
        activeCompareTabId={activeCompareTabId}
        onSelectCompareTab={handleSelectCompareTab}
        onCloseCompareTab={(compareTabId) => {
          void handleCloseCompareSession(compareTabId)
        }}
      />

      {showResult ? (
        <>
          {/* 打开文件差异时内容区整块换成 `FileDiffView`，目录工具栏此时不描述任何东西。 */}
          {hasActiveDiffTab ? null : <CompareToolbar />}

          <DiffTabStrip />

          <div className="flex-1 overflow-hidden">
            <ComparePageContent
              onDoubleClickFile={handleDoubleClickFile}
              onExtensionFilterChange={handleExtensionFilterChange}
              onSourcePathSubmit={handleSourcePathSubmit}
            />
          </div>
        </>
      ) : (
        <>
          <Toolbar title="新建对比" sticky={false} />
          <div className="min-h-0 flex-1 overflow-auto">
            <CompareSetupPanel />
          </div>
        </>
      )}
    </div>
  )
}
