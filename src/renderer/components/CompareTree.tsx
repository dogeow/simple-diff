import { useMemo, useCallback, useEffect, useRef, useState } from 'react'
import type { CompareEntry, CompareFilter } from '../../../shared/types'
import { useShallow } from 'zustand/react/shallow'
import { useCompareNodeInteractions } from '../hooks/useCompareNodeInteractions'
import { useVisibleCompareNodes } from '../hooks/useVisibleCompareNodes'
import { useCompareStore } from '../stores/compare-store'
import CompareToolbar from './CompareToolbar'
import TreeRow from './TreeRow'
import FileContextMenu, { type ContextMenuAction } from './FileContextMenu'
import { useCompareActions } from '../hooks/useCompare'
import { useAppStore } from '../stores/app-store'
import type { StrategyName } from '../../../shared/types'
import { shouldShowSyncTaskInCompare } from '../utils/sync-task-visibility'
import { createExactPathFilter } from '@shared/path-filter'
import { type TreeNode } from '../utils/tree-utils'

interface CompareTreeProps {
  readonly entries: readonly CompareEntry[]
  readonly filter: CompareFilter
  readonly onFilterChange: (filter: CompareFilter) => void
  readonly onDoubleClickFile: (entry: CompareEntry) => void
  readonly toolbarOnly?: boolean
  readonly emptyStateMessage?: string
  readonly onRerunCompare?: () => void
  readonly onExtensionFilterChange?: (filter: readonly string[]) => void | Promise<void>
}

interface ContextMenuState {
  readonly x: number
  readonly y: number
  readonly node: TreeNode
}

const ROW_HEIGHT = 40
const OVERSCAN_ROWS = 12

interface CompareTreeTableProps {
  readonly entries: readonly CompareEntry[]
  readonly filter: CompareFilter
  readonly emptyStateMessage: string
  readonly extensionFilter: readonly string[]
  readonly onDoubleClickFile: (entry: CompareEntry) => void
  readonly onExtensionFilterChange?: (filter: readonly string[]) => void | Promise<void>
  readonly setExtensionFilter: (filter: readonly string[]) => void
}

function CompareTreeTable({
  entries,
  filter,
  emptyStateMessage,
  extensionFilter,
  onDoubleClickFile,
  onExtensionFilterChange,
  setExtensionFilter,
}: CompareTreeTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const nodeInteractions = useCompareNodeInteractions(onDoubleClickFile)
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const visibleNodes = useVisibleCompareNodes({ entries, filter })

  const renderedWindow = useMemo(() => {
    if (visibleNodes.length === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      }
    }

    const safeViewportHeight = Math.max(viewportHeight, ROW_HEIGHT)
    const visibleCount = Math.ceil(safeViewportHeight / ROW_HEIGHT)
    const windowSize = visibleCount + OVERSCAN_ROWS * 2
    const rawStartIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS)
    const startIndex = Math.min(rawStartIndex, Math.max(0, visibleNodes.length - windowSize))
    const endIndex = Math.min(visibleNodes.length, startIndex + windowSize)

    return {
      startIndex,
      endIndex,
      topSpacerHeight: startIndex * ROW_HEIGHT,
      bottomSpacerHeight: Math.max(0, (visibleNodes.length - endIndex) * ROW_HEIGHT),
    }
  }, [scrollTop, viewportHeight, visibleNodes.length])

  const renderedNodes = useMemo(
    () => visibleNodes.slice(renderedWindow.startIndex, renderedWindow.endIndex),
    [renderedWindow.endIndex, renderedWindow.startIndex, visibleNodes],
  )

  useEffect(() => {
    const element = tableRef.current
    if (!element) return

    const update = () => {
      setViewportHeight(element.clientHeight)
      setScrollTop(element.scrollTop)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const handleIgnoreNode = useCallback((node: TreeNode) => {
    const rule = createExactPathFilter(node.relativePath)
    if (extensionFilter.includes(rule)) return
    const nextFilters = [...extensionFilter, rule]
    if (onExtensionFilterChange) {
      void onExtensionFilterChange(nextFilters)
      return
    }
    setExtensionFilter(nextFilters)
  }, [extensionFilter, onExtensionFilterChange, setExtensionFilter])

  const getContextActions = useCallback((node: TreeNode): readonly ContextMenuAction[] => {
    if (!node.entry) return []
    return [{
      label: `${node.isDirectory ? '忽略目录' : '忽略文件'}：『${node.name}』`,
      onClick: () => handleIgnoreNode(node),
    }]
  }, [handleIgnoreNode])

  return (
    <>
      <div ref={tableRef} className="flex-1 overflow-auto rounded border border-neutral-700" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-neutral-700 bg-neutral-800 text-xs text-neutral-400">
            <tr>
              <th className="w-20 border-r border-neutral-700/50 px-2 py-2 text-right">左大小</th>
              <th className="w-32 border-r border-neutral-700/50 px-2 py-2 text-right">左修改时间</th>
              <th className="px-3 py-2">名称</th>
              <th className="w-16 px-2 py-2 text-center">状态</th>
              <th className="w-20 border-l border-neutral-700/50 px-2 py-2 text-right">右大小</th>
              <th className="w-32 border-l border-neutral-700/50 px-2 py-2 text-right">右修改时间</th>
            </tr>
          </thead>
          <tbody>
            {visibleNodes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-neutral-500">
                  {emptyStateMessage}
                </td>
              </tr>
            )}
            {visibleNodes.length > 0 && renderedWindow.topSpacerHeight > 0 && (
              <tr aria-hidden="true">
                <td colSpan={6} className="p-0" style={{ height: `${renderedWindow.topSpacerHeight}px` }} />
              </tr>
            )}
            {renderedNodes.map((node) => (
              <TreeRow
                key={node.relativePath}
                node={node}
                expanded={nodeInteractions.isExpanded(node)}
                loading={nodeInteractions.isLoading(node)}
                onToggle={() => nodeInteractions.toggleNode(node)}
                onDoubleClick={() => nodeInteractions.openNode(node)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setCtxMenu({ x: event.clientX, y: event.clientY, node })
                }}
              />
            ))}
            {visibleNodes.length > 0 && renderedWindow.bottomSpacerHeight > 0 && (
              <tr aria-hidden="true">
                <td colSpan={6} className="p-0" style={{ height: `${renderedWindow.bottomSpacerHeight}px` }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {ctxMenu && (
        <FileContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          actions={getContextActions(ctxMenu.node)}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  )
}

export default function CompareTree({ entries, filter, onFilterChange, onDoubleClickFile, toolbarOnly = false, emptyStateMessage = '无匹配项', onRerunCompare, onExtensionFilterChange }: CompareTreeProps) {
  const clearDiffTabs = useAppStore((s) => s.clearDiffTabs)
  const setActiveDiffTab = useAppStore((s) => s.setActiveDiffTab)
  const { pauseCompare, resumeCompare, restartCompare } = useCompareActions()
  const {
    expandedDirs,
    expandAll,
    collapseAll,
    setStrategies,
    loading,
    paused,
    viewMode,
    setViewMode,
    strategies,
    extensionFilter,
    setExtensionFilter,
    hideDot,
    setHideDot,
    hideDotFilter,
    setHideDotFilter,
    syncTask,
    leftSource,
    rightSource,
    setSyncTask,
    compareDone,
    entrySummary,
  } = useCompareStore(useShallow((s) => ({
    expandedDirs: s.expandedDirs,
    expandAll: s.expandAll,
    collapseAll: s.collapseAll,
    setStrategies: s.setStrategies,
    loading: s.scanning || s.comparing,
    paused: s.paused,
    viewMode: s.viewMode,
    setViewMode: s.setViewMode,
    strategies: s.strategies,
    extensionFilter: s.extensionFilter,
    setExtensionFilter: s.setExtensionFilter,
    hideDot: s.hideDot,
    setHideDot: s.setHideDot,
    hideDotFilter: s.hideDotFilter,
    setHideDotFilter: s.setHideDotFilter,
    syncTask: s.syncTask,
    leftSource: s.leftSource,
    rightSource: s.rightSource,
    setSyncTask: s.setSyncTask,
    compareDone: s.done,
    entrySummary: s.entrySummary,
  })))

  const { stats, pendingCount, allDirCount } = entrySummary
  const allExpanded = allDirCount > 0 && expandedDirs.size >= allDirCount
  const toggleExpandAll = useCallback(() => {
    if (allExpanded) collapseAll()
    else expandAll()
  }, [allExpanded, collapseAll, expandAll])
  const visibleSyncTask = useMemo(() => {
    return shouldShowSyncTaskInCompare(syncTask, leftSource, rightSource)
      ? syncTask
      : null
  }, [leftSource, rightSource, syncTask])

  const hasComparedResult = compareDone || pendingCount > 0 || entries.length > 0

  const handleToggleStrategy = useCallback((strategy: StrategyName) => {
    const nextStrategies = [...strategies]
    const index = nextStrategies.indexOf(strategy)

    if (index >= 0) {
      nextStrategies.splice(index, 1)
    } else {
      nextStrategies.push(strategy)
    }

    setStrategies(nextStrategies)
  }, [setStrategies, strategies])

  const handleRestartCompare = useCallback(async () => {
    if (onRerunCompare) {
      await onRerunCompare()
      return
    }

    clearDiffTabs()
    setActiveDiffTab(null)
    await restartCompare()
  }, [clearDiffTabs, onRerunCompare, restartCompare, setActiveDiffTab])

  const handlePauseCompare = useCallback(async () => {
    await pauseCompare()
  }, [pauseCompare])

  const handleResumeCompare = useCallback(async () => {
    clearDiffTabs()
    setActiveDiffTab(null)
    await resumeCompare()
  }, [clearDiffTabs, resumeCompare, setActiveDiffTab])

  const handleExtensionFilterChange = useCallback(async (nextFilters: readonly string[]) => {
    if (onExtensionFilterChange) {
      await onExtensionFilterChange(nextFilters)
      return
    }

    setExtensionFilter(nextFilters)
  }, [onExtensionFilterChange, setExtensionFilter])

  const handleStartSync = useCallback(async (direction: 'left_to_right' | 'right_to_left') => {
    if (!leftSource || !rightSource || !compareDone || pendingCount > 0 || entries.length === 0) return
    const response = await window.api.startSync({
      leftSource,
      rightSource,
      direction,
      entries,
    })
    if (response.success) {
      setSyncTask(response.data ?? null)
    }
  }, [compareDone, entries, leftSource, pendingCount, rightSource, setSyncTask])

  const handlePauseSync = useCallback(async () => {
    const response = await window.api.pauseSync()
    if (response.success) setSyncTask(response.data ?? null)
  }, [setSyncTask])

  const handleResumeSync = useCallback(async () => {
    const response = await window.api.resumeSync()
    if (response.success) setSyncTask(response.data ?? null)
  }, [setSyncTask])

  const handleClearSync = useCallback(async () => {
    const response = await window.api.clearSync()
    if (response.success) setSyncTask(null)
  }, [setSyncTask])

  return (
    <div className={toolbarOnly ? '' : 'flex h-full flex-col gap-2'}>
      <CompareToolbar
        filter={filter}
        onFilterChange={onFilterChange}
        stats={stats}
        pendingCount={pendingCount}
        viewMode={viewMode}
        setViewMode={setViewMode}
        allExpanded={allExpanded}
        toggleExpandAll={toggleExpandAll}
        strategies={strategies}
        onToggleStrategy={handleToggleStrategy}
        extensionFilter={extensionFilter}
        setExtensionFilter={handleExtensionFilterChange}
        hideDot={hideDot}
        setHideDot={setHideDot}
        hideDotFilter={hideDotFilter}
        setHideDotFilter={setHideDotFilter}
        compareLoading={loading}
        comparePaused={paused}
        compareDone={compareDone}
        hasComparedResult={hasComparedResult}
        onPauseCompare={handlePauseCompare}
        onResumeCompare={handleResumeCompare}
        onRestartCompare={handleRestartCompare}
        hasGlobalSyncTask={syncTask !== null}
        syncTask={visibleSyncTask}
        onStartSync={handleStartSync}
        onPauseSync={handlePauseSync}
        onResumeSync={handleResumeSync}
        onClearSync={handleClearSync}
      />

      {/* Dual-panel table (hidden in toolbarOnly mode) */}
      {!toolbarOnly && (
        <CompareTreeTable
          entries={entries}
          filter={filter}
          emptyStateMessage={emptyStateMessage}
          extensionFilter={extensionFilter}
          onDoubleClickFile={onDoubleClickFile}
          onExtensionFilterChange={onExtensionFilterChange}
          setExtensionFilter={setExtensionFilter}
        />
      )}
    </div>
  )
}
