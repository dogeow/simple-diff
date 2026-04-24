import { useMemo, useCallback, useState } from 'react'
import type { CompareEntry, CompareFilter } from '../../../shared/types'
import { useCompareNodeInteractions } from '../hooks/useCompareNodeInteractions'
import { useVisibleCompareNodes } from '../hooks/useVisibleCompareNodes'
import { useCompareStore, computeStats } from '../stores/compare-store'
import CompareToolbar from './CompareToolbar'
import TreeRow from './TreeRow'
import FileContextMenu, { type ContextMenuAction } from './FileContextMenu'
import { useCompare } from '../hooks/useCompare'
import { useAppStore } from '../stores/app-store'
import type { StrategyName } from '../../../shared/types'
import { shouldShowSyncTaskInCompare } from '../utils/sync-task-visibility'
import { createExactPathFilter } from '@shared/path-filter'
import { matchesCompareFilter, type TreeNode } from '../utils/tree-utils'

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

export default function CompareTree({ entries, filter, onFilterChange, onDoubleClickFile, toolbarOnly = false, emptyStateMessage = '无匹配项', onRerunCompare, onExtensionFilterChange }: CompareTreeProps) {
  const expandedDirs = useCompareStore((s) => s.expandedDirs)
  const expandAll = useCompareStore((s) => s.expandAll)
  const collapseAll = useCompareStore((s) => s.collapseAll)
  const nodeInteractions = useCompareNodeInteractions(onDoubleClickFile)
  const setStrategies = useCompareStore((s) => s.setStrategies)
  const clearDiffTabs = useAppStore((s) => s.clearDiffTabs)
  const setActiveDiffTab = useAppStore((s) => s.setActiveDiffTab)
  const { loading, runCompare } = useCompare()

  const allDirCount = useMemo(() => entries.filter((e) => e.isDirectory).length, [entries])
  const allExpanded = allDirCount > 0 && expandedDirs.size >= allDirCount
  const toggleExpandAll = useCallback(() => {
    if (allExpanded) collapseAll()
    else expandAll()
  }, [allExpanded, collapseAll, expandAll])
  const viewMode = useCompareStore((s) => s.viewMode)
  const setViewMode = useCompareStore((s) => s.setViewMode)
  const strategies = useCompareStore((s) => s.strategies)
  const extensionFilter = useCompareStore((s) => s.extensionFilter)
  const setExtensionFilter = useCompareStore((s) => s.setExtensionFilter)
  const hideDot = useCompareStore((s) => s.hideDot)
  const setHideDot = useCompareStore((s) => s.setHideDot)
  const hideDotFilter = useCompareStore((s) => s.hideDotFilter)
  const setHideDotFilter = useCompareStore((s) => s.setHideDotFilter)
  const syncTask = useCompareStore((s) => s.syncTask)
  const leftSource = useCompareStore((s) => s.leftSource)
  const rightSource = useCompareStore((s) => s.rightSource)
  const setSyncTask = useCompareStore((s) => s.setSyncTask)
  const visibleSyncTask = useMemo(() => {
    return shouldShowSyncTaskInCompare(syncTask, leftSource, rightSource)
      ? syncTask
      : null
  }, [leftSource, rightSource, syncTask])
  const compareDone = useCompareStore((s) => s.done)
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)

  const stats = useMemo(() => computeStats(entries), [entries])
  const pendingCount = useMemo(() => entries.filter((e) => e.state === 'pending' || e.state === 'comparing').length, [entries])
  const hiddenPendingCount = useMemo(
    () => entries.filter((entry) => (entry.state === 'pending' || entry.state === 'comparing') && !matchesCompareFilter(filter, entry)).length,
    [entries, filter],
  )
  const hasComparedResult = compareDone || pendingCount > 0 || entries.length > 0
  const visibleNodes = useVisibleCompareNodes({ entries, filter })

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

  const handleRerunCompare = useCallback(async () => {
    if (onRerunCompare) {
      await onRerunCompare()
      return
    }

    clearDiffTabs()
    setActiveDiffTab(null)
    await runCompare()
  }, [clearDiffTabs, onRerunCompare, runCompare, setActiveDiffTab])

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
        hiddenPendingCount={hiddenPendingCount}
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
        compareDone={compareDone}
        hasComparedResult={hasComparedResult}
        onRerunCompare={handleRerunCompare}
        hasGlobalSyncTask={syncTask !== null}
        syncTask={visibleSyncTask}
        onStartSync={handleStartSync}
        onPauseSync={handlePauseSync}
        onResumeSync={handleResumeSync}
        onClearSync={handleClearSync}
      />

      {/* Dual-panel table (hidden in toolbarOnly mode) */}
      {!toolbarOnly && <div className="flex-1 overflow-auto rounded border border-neutral-700">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-neutral-700 bg-neutral-800 text-xs text-neutral-400">
            <tr>
              {/* Left panel */}
              <th className="w-20 border-r border-neutral-700/50 px-2 py-2 text-right">左大小</th>
              <th className="w-32 border-r border-neutral-700/50 px-2 py-2 text-right">左修改时间</th>
              {/* Center */}
              <th className="px-3 py-2">名称</th>
              <th className="w-16 px-2 py-2 text-center">状态</th>
              {/* Right panel */}
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
            {visibleNodes.map((node) => (
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
          </tbody>
        </table>
      </div>}

      {ctxMenu && (
        <FileContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          actions={getContextActions(ctxMenu.node)}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
