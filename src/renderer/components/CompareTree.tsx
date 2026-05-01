import { useMemo, useCallback, useEffect, useRef, useState } from 'react'
import type { CompareEntry, CompareFilter, SyncDirection } from '../../../shared/types'
import { useShallow } from 'zustand/react/shallow'
import { useCompareNodeInteractions } from '../hooks/useCompareNodeInteractions'
import { useVisibleCompareNodes } from '../hooks/useVisibleCompareNodes'
import { useCompareStore } from '../stores/compare-store'
import CompareToolbar from './CompareToolbar'
import TreeRow from './TreeRow'
import FileContextMenu, { type ContextMenuAction } from './FileContextMenu'
import { rememberSyncDirtyRoots, useCompareActions } from '../hooks/useCompare'
import { useAppStore } from '../stores/app-store'
import type { StrategyName } from '../../../shared/types'
import { shouldShowSyncTaskInCompare } from '../utils/sync-task-visibility'
import { createExactPathFilter } from '@shared/path-filter'
import { type TreeNode } from '../utils/tree-utils'
import { getSyncRecompareRootsFromEntries } from '../utils/sync-dirty'
import { collectSyncEntriesForSelection, resolveCompareSelection, type CompareSelectionState } from '../utils/compare-selection'
import { isSameSourceConfig } from '../utils/source-label'

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

function canQueueSyncDirection(
  syncTask: ReturnType<typeof useCompareStore.getState>['syncTask'],
  leftSource: ReturnType<typeof useCompareStore.getState>['leftSource'],
  rightSource: ReturnType<typeof useCompareStore.getState>['rightSource'],
  direction: SyncDirection,
): boolean {
  if (!syncTask || !leftSource || !rightSource) {
    return true
  }

  return syncTask.status === 'running'
    && syncTask.direction === direction
    && isSameSourceConfig(syncTask.leftSource, leftSource)
    && isSameSourceConfig(syncTask.rightSource, rightSource)
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
  const { dirtyDisplayPaths, leftSource, rightSource, compareDone, syncTask, setSyncTask } = useCompareStore(useShallow((state) => ({
    dirtyDisplayPaths: state.dirtyDisplayPaths,
    leftSource: state.leftSource,
    rightSource: state.rightSource,
    compareDone: state.done,
    syncTask: state.syncTask,
    setSyncTask: state.setSyncTask,
  })))
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const [selection, setSelection] = useState<CompareSelectionState>({ selectedPaths: new Set(), anchorPath: null })
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
  const orderedPaths = useMemo(() => visibleNodes.map((node) => node.relativePath), [visibleNodes])
  const selectedCount = selection.selectedPaths.size
  const leftSelectionEntries = useMemo(
    () => collectSyncEntriesForSelection(entries, selection.selectedPaths, 'left_to_right'),
    [entries, selection.selectedPaths],
  )
  const rightSelectionEntries = useMemo(
    () => collectSyncEntriesForSelection(entries, selection.selectedPaths, 'right_to_left'),
    [entries, selection.selectedPaths],
  )

  useEffect(() => {
    const visiblePathSet = new Set(visibleNodes.map((node) => node.relativePath))
    setSelection((current) => {
      const nextSelectedPaths = new Set(Array.from(current.selectedPaths).filter((path) => visiblePathSet.has(path)))
      const nextAnchorPath = current.anchorPath && visiblePathSet.has(current.anchorPath) ? current.anchorPath : null

      if (nextSelectedPaths.size === current.selectedPaths.size && nextAnchorPath === current.anchorPath) {
        return current
      }

      return {
        selectedPaths: nextSelectedPaths,
        anchorPath: nextAnchorPath,
      }
    })
  }, [visibleNodes])

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

  const handleSelectNode = useCallback((event: React.MouseEvent, node: TreeNode) => {
    setSelection((current) => resolveCompareSelection(current, {
      orderedPaths,
      clickedPath: node.relativePath,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
    }))
  }, [orderedPaths])

  const handleCopySelection = useCallback(async (paths: ReadonlySet<string>, direction: SyncDirection) => {
    if (!leftSource || !rightSource || !compareDone) return
    if (!canQueueSyncDirection(syncTask, leftSource, rightSource, direction)) return

    const syncEntries = collectSyncEntriesForSelection(entries, paths, direction)
    if (syncEntries.length === 0) return

    const response = await window.api.startSync({
      leftSource,
      rightSource,
      direction,
      entries: syncEntries,
    })

    if (response.success) {
      useCompareStore.getState().markDirtyPaths(Array.from(paths))
      rememberSyncDirtyRoots(response.data?.id, getSyncRecompareRootsFromEntries(syncEntries))
      setSyncTask(response.data ?? null)
    }
  }, [compareDone, entries, leftSource, rightSource, setSyncTask, syncTask])

  const getContextActions = useCallback((node: TreeNode): readonly ContextMenuAction[] => {
    if (!node.entry) return []
    const effectiveSelectedPaths = selection.selectedPaths.has(node.relativePath)
      ? selection.selectedPaths
      : new Set([node.relativePath])
    const leftSyncEntries = collectSyncEntriesForSelection(entries, effectiveSelectedPaths, 'left_to_right')
    const rightSyncEntries = collectSyncEntriesForSelection(entries, effectiveSelectedPaths, 'right_to_left')
    const selectedSuffix = effectiveSelectedPaths.size > 1 ? ` (${effectiveSelectedPaths.size})` : ''
    const actions: ContextMenuAction[] = []

    if (compareDone && leftSyncEntries.length > 0 && canQueueSyncDirection(syncTask, leftSource, rightSource, 'left_to_right')) {
      actions.push({
        label: effectiveSelectedPaths.size > 1 ? `复制所选到右边${selectedSuffix}` : '复制到右边',
        onClick: () => {
          void handleCopySelection(effectiveSelectedPaths, 'left_to_right')
        },
      })
    }

    if (compareDone && rightSyncEntries.length > 0 && canQueueSyncDirection(syncTask, leftSource, rightSource, 'right_to_left')) {
      actions.push({
        label: effectiveSelectedPaths.size > 1 ? `复制所选到左边${selectedSuffix}` : '复制到左边',
        onClick: () => {
          void handleCopySelection(effectiveSelectedPaths, 'right_to_left')
        },
      })
    }

    actions.push({
      label: `${node.isDirectory ? '忽略目录' : '忽略文件'}：『${node.name}』`,
      onClick: () => handleIgnoreNode(node),
    })

    return actions
  }, [compareDone, entries, handleCopySelection, handleIgnoreNode, leftSource, rightSource, selection.selectedPaths, syncTask])

  return (
    <>
      {selectedCount > 0 && (
        <div className="flex shrink-0 items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-400">
          <div className="min-w-0 truncate">
            已选 {selectedCount} 项，可按 Shift 连选、按 Cmd/Ctrl 增减选择
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              onClick={() => {
                void handleCopySelection(selection.selectedPaths, 'left_to_right')
              }}
              disabled={leftSelectionEntries.length === 0 || !canQueueSyncDirection(syncTask, leftSource, rightSource, 'left_to_right')}
              className="inline-flex items-center rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
            >
              复制所选到右边
            </button>
            <button
              onClick={() => {
                void handleCopySelection(selection.selectedPaths, 'right_to_left')
              }}
              disabled={rightSelectionEntries.length === 0 || !canQueueSyncDirection(syncTask, leftSource, rightSource, 'right_to_left')}
              className="inline-flex items-center rounded-md bg-cyan-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
            >
              复制所选到左边
            </button>
            <button
              onClick={() => setSelection({ selectedPaths: new Set(), anchorPath: null })}
              className="inline-flex items-center rounded-md border border-neutral-700 bg-neutral-800/70 px-2.5 py-1 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
            >
              清除选择
            </button>
          </div>
        </div>
      )}
      <div ref={tableRef} className="flex-1 overflow-auto rounded-md border border-neutral-800 bg-neutral-900/40" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-850 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="w-20 border-r border-neutral-800 px-2 py-2 text-right">左大小</th>
              <th className="w-32 border-r border-neutral-800 px-2 py-2 text-right">左修改时间</th>
              <th className="px-3 py-2">名称</th>
              <th className="w-16 px-2 py-2 text-center">状态</th>
              <th className="w-20 border-l border-neutral-800 px-2 py-2 text-right">右大小</th>
              <th className="w-32 border-l border-neutral-800 px-2 py-2 text-right">右修改时间</th>
            </tr>
          </thead>
          <tbody>
            {visibleNodes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center text-sm text-neutral-500">
                  <div className="flex flex-col items-center gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800 text-neutral-600 text-base">∅</span>
                    {emptyStateMessage}
                  </div>
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
                dirty={dirtyDisplayPaths.has('') || dirtyDisplayPaths.has(node.relativePath)}
                selected={selection.selectedPaths.has(node.relativePath)}
                onClick={(event) => handleSelectNode(event, node)}
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
  const { pauseCompare, resumeCompare, restartCompare, recompareDirtyPaths } = useCompareActions()
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
    dirtyCount,
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
    dirtyCount: s.dirtyPaths.size,
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

  const handleRecompareDirtyPaths = useCallback(async () => {
    clearDiffTabs()
    setActiveDiffTab(null)
    await recompareDirtyPaths()
  }, [clearDiffTabs, recompareDirtyPaths, setActiveDiffTab])

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
      const roots = getSyncRecompareRootsFromEntries(entries)
      useCompareStore.getState().markDirtyPaths(roots)
      rememberSyncDirtyRoots(response.data?.id, roots)
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
        dirtyCount={dirtyCount}
        onPauseCompare={handlePauseCompare}
        onResumeCompare={handleResumeCompare}
        onRestartCompare={handleRestartCompare}
        onRecompareDirtyPaths={handleRecompareDirtyPaths}
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
