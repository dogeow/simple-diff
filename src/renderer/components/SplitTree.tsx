import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { joinSourcePath } from '@shared/source-path'
import { useShallow } from 'zustand/react/shallow'
import type { CompareEntry, CompareFilter, SyncDirection } from '../../../shared/types'
import { type TreeNode, type VisibleTreeNodes } from '../utils/tree-utils'
import TreeEntryCell from './TreeEntryCell'
import { formatSize, formatTime, rowBg, SELECTED_ROW_BG, shouldShowDirectorySpinner } from './tree-row-utils'
import { useVisibleCompareNodes } from '../hooks/useVisibleCompareNodes'
import { useCompareNodeInteractions, type CompareNodeInteractions } from '../hooks/useCompareNodeInteractions'
import { useCompareStore } from '../stores/compare-store'
import { useSSHStore } from '../stores/ssh-store'
import StatusBadge from './StatusBadge'
import ScrollGutter from './ScrollGutter'
import FileContextMenu, { type ContextMenuAction } from './FileContextMenu'
import { createExactPathFilter } from '@shared/path-filter'
import { collectSyncEntriesForSelection, resolveCompareSelection, type CompareSelectionState } from '../utils/compare-selection'
import { formatSourceTag, isSameSourceConfig } from '../utils/source-label'
import { rememberSyncDirtyRoots } from '../hooks/useCompare'
import { getSyncRecompareRootsFromEntries } from '../utils/sync-dirty'
import { formatSourceInputValue, isBrowserSourcePath } from '../runtime/browser-roots'
import { getRuntimeInfo } from '../runtime/runtime-info'

interface SplitTreeProps {
  readonly entries: readonly CompareEntry[]
  readonly filter: CompareFilter
  readonly onDoubleClickFile: (entry: CompareEntry) => void
  readonly emptyStateMessage?: string
  readonly onExtensionFilterChange?: (filter: readonly string[]) => void | Promise<void>
  readonly onSourcePathSubmit?: (side: Side, path: string) => void | Promise<void>
}

type Side = 'left' | 'right'
const ROW_HEIGHT = 40
const OVERSCAN_ROWS = 12

function canQueueSyncDirection(
  syncTask: ReturnType<typeof useCompareStore.getState>['syncTask'],
  leftSource: ReturnType<typeof useCompareStore.getState>['leftSource'],
  rightSource: ReturnType<typeof useCompareStore.getState>['rightSource'],
  direction: SyncDirection,
): boolean {
  if (!leftSource || !rightSource) {
    return false
  }

  if (!syncTask || syncTask.status !== 'running') {
    return true
  }

  return syncTask.direction === direction
    && isSameSourceConfig(syncTask.leftSource, leftSource)
    && isSameSourceConfig(syncTask.rightSource, rightSource)
}

// ─── Path Header ─────────────────────────────────────────────

function PathHeader({
  side,
  onSourcePathSubmit,
}: {
  readonly side: Side
  readonly onSourcePathSubmit?: (side: Side, path: string) => void | Promise<void>
}) {
  const source = useCompareStore((s) => side === 'left' ? s.leftSource : s.rightSource)
  const { configs, loadConfigs } = useSSHStore(useShallow((state) => ({
    configs: state.configs,
    loadConfigs: state.loadConfigs,
  })))
  const sourcePath = useCompareStore((s) => side === 'left' ? s.leftPath : s.rightPath)
  const browserLocalSource = source?.type === 'local' && getRuntimeInfo().mode === 'web' && isBrowserSourcePath(source.path)
  const [pathInput, setPathInput] = useState(sourcePath)

  useEffect(() => {
    if (source?.type === 'sftp' && configs.length === 0) {
      void loadConfigs()
    }
  }, [configs.length, loadConfigs, source])

  useEffect(() => {
    setPathInput(browserLocalSource ? formatSourceInputValue(sourcePath) : sourcePath)
  }, [browserLocalSource, sourcePath])

  const handlePathSubmit = useCallback(() => {
    if (browserLocalSource) {
      return
    }

    const trimmed = pathInput.trim()
    if (!trimmed) {
      setPathInput(sourcePath)
      return
    }

    if (trimmed !== sourcePath) {
      void onSourcePathSubmit?.(side, trimmed)
    }
  }, [browserLocalSource, onSourcePathSubmit, pathInput, sourcePath, side])

  const sideBadgeClass = side === 'left'
    ? 'bg-sky-500/15 text-sky-300'
    : 'bg-violet-500/15 text-violet-300'
  const sourceTag = source ? formatSourceTag(source, configs) : side === 'left' ? '左侧' : '右侧'

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 border-b border-neutral-800 bg-neutral-850 px-2 py-1.5">
        <div className="flex w-full min-w-0 items-center gap-2 overflow-hidden">
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${sideBadgeClass}`}>
            {side === 'left' ? 'L' : 'R'}
          </span>
          <span className="max-w-[10rem] shrink-0 truncate text-[11px] text-neutral-500">{sourceTag}</span>
          <input
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            readOnly={browserLocalSource}
            onBlur={handlePathSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handlePathSubmit()
              if (e.key === 'Escape') {
                setPathInput(sourcePath)
                e.currentTarget.blur()
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900/80 px-2 py-1 font-mono text-xs text-neutral-200 outline-none transition-colors placeholder:text-neutral-600 focus:border-neutral-600"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Side Table ──────────────────────────────────────────────

interface ContextMenuState {
  readonly x: number
  readonly y: number
  readonly node: TreeNode
}

interface SideTableProps {
  readonly visibleNodes: VisibleTreeNodes
  readonly entries: readonly CompareEntry[]
  readonly side: Side
  readonly sourcePath: string
  readonly isLocal: boolean
  readonly nodeInteractions: CompareNodeInteractions
  readonly startIndex: number
  readonly endIndex: number
  readonly topSpacerHeight: number
  readonly bottomSpacerHeight: number
  readonly emptyStateMessage: string
  readonly selectedPaths: ReadonlySet<string>
  readonly onSelectNode: (event: React.MouseEvent, node: TreeNode) => void
  readonly onExtensionFilterChange?: (filter: readonly string[]) => void | Promise<void>
}

function SideTable({
  visibleNodes,
  entries,
  side,
  sourcePath,
  isLocal,
  nodeInteractions,
  startIndex,
  endIndex,
  topSpacerHeight,
  bottomSpacerHeight,
  emptyStateMessage,
  selectedPaths,
  onSelectNode,
  onExtensionFilterChange,
}: SideTableProps) {
  const runtime = getRuntimeInfo()
  const supportsSync = runtime.supportsSync
  const isDesktopRuntime = runtime.mode === 'electron'
  const {
    refreshDir,
    leftSource,
    rightSource,
    syncTask,
    setSyncTask,
    extensionFilter,
    setExtensionFilter,
    dirtyDisplayPaths,
  } = useCompareStore(useShallow((s) => ({
    refreshDir: s.refreshDir,
    leftSource: s.leftSource,
    rightSource: s.rightSource,
    syncTask: s.syncTask,
    setSyncTask: s.setSyncTask,
    extensionFilter: s.extensionFilter,
    setExtensionFilter: s.setExtensionFilter,
    dirtyDisplayPaths: s.dirtyDisplayPaths,
  })))
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renderedNodes = visibleNodes.slice(startIndex, endIndex)

  const buildFullPath = (relativePath: string) => {
    return joinSourcePath(isLocal ? 'local' : 'sftp', sourcePath, relativePath)
  }

  const getParentRelativePath = (relativePath: string): string => {
    const segments = relativePath.split('/')
    return segments.length > 1 ? segments.slice(0, -1).join('/') : ''
  }

  const handleCopySelection = useCallback(async (paths: ReadonlySet<string>, direction: SyncDirection) => {
    if (!leftSource || !rightSource) return
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
  }, [entries, leftSource, rightSource, setSyncTask, syncTask])

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, node })
  }, [])

  const getContextActions = (node: TreeNode): readonly ContextMenuAction[] => {
    if (!node.entry) return []
    const fileInfo = side === 'left' ? node.entry.left : node.entry.right
    if (!fileInfo) return []

    const fullPath = buildFullPath(node.relativePath)
    const ignoreAction: ContextMenuAction = {
      label: `${node.isDirectory ? '忽略目录' : '忽略文件'}：『${node.name}』`,
      onClick: () => {
        const rule = createExactPathFilter(node.relativePath)
        if (extensionFilter.includes(rule)) return
        const nextFilters = [...extensionFilter, rule]
        if (onExtensionFilterChange) {
          void onExtensionFilterChange(nextFilters)
          return
        }
        setExtensionFilter(nextFilters)
      },
    }

    const copyDirection = side === 'left' ? 'left_to_right' : 'right_to_left'
    const effectiveSelectedPaths = selectedPaths.has(node.relativePath)
      ? selectedPaths
      : new Set([node.relativePath])
    const syncEntries = collectSyncEntriesForSelection(entries, effectiveSelectedPaths, copyDirection)
    const copyLabel = effectiveSelectedPaths.size > 1
      ? `${side === 'left' ? '复制所选到右边' : '复制所选到左边'} (${effectiveSelectedPaths.size})`
      : side === 'left'
        ? '复制到右边'
        : '复制到左边'
    const canCopySelection = canQueueSyncDirection(syncTask, leftSource, rightSource, copyDirection)
    const copyAction = supportsSync && syncEntries.length > 0
      ? [{
          label: copyLabel,
          disabled: !canCopySelection,
          onClick: () => {
            if (!canCopySelection) return
            void handleCopySelection(effectiveSelectedPaths, copyDirection)
          },
        } satisfies ContextMenuAction]
      : []

    if (!isLocal || !isDesktopRuntime) {
      return [...copyAction, ignoreAction]
    }

    const actions: ContextMenuAction[] = [
      ...copyAction,
      {
        label: '在 Finder 中显示',
        onClick: () => window.api.showInFolder(fullPath),
      },
      {
        label: '重命名',
        onClick: () => {
          setRenaming(node.relativePath)
          setRenameValue(node.name)
        },
      },
      {
        label: '删除',
        danger: true,
        onClick: async () => {
          const confirmed = window.confirm(`确定删除 "${node.name}" 吗？`)
          if (confirmed) {
            const result = await window.api.deleteFile(fullPath, node.isDirectory)
            if (result.success) {
              await refreshDir(getParentRelativePath(node.relativePath))
            }
          }
        },
      },
      ignoreAction,
    ]
    return actions
  }

  const handleRenameSubmit = useCallback(async (node: TreeNode) => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== node.name) {
      const fullPath = buildFullPath(node.relativePath)
      const result = await window.api.renameFile(fullPath, trimmed)
      if (result.success) {
        await refreshDir(getParentRelativePath(node.relativePath))
      }
    }
    setRenaming(null)
  }, [renameValue, refreshDir])

  return (
    <div>
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-850 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
          <tr>
            <th className="px-3 py-1.5 whitespace-nowrap">名称</th>
            <th className="w-20 px-2 py-1.5 text-center whitespace-nowrap">状态</th>
            <th className="w-24 px-2 py-1.5 text-right whitespace-nowrap">大小</th>
            <th className="w-40 px-2 py-1.5 text-right whitespace-nowrap">修改时间</th>
          </tr>
        </thead>
        <tbody>
          {visibleNodes.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-10 text-center text-xs text-neutral-500">
                <div className="flex flex-col items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-neutral-600">∅</span>
                  {emptyStateMessage}
                </div>
              </td>
            </tr>
          )}
          {visibleNodes.length > 0 && topSpacerHeight > 0 && (
            <tr aria-hidden="true">
              <td colSpan={4} className="p-0" style={{ height: `${topSpacerHeight}px` }} />
            </tr>
          )}
          {renderedNodes.map((node) => (
            <SideRow
              key={node.relativePath}
              node={node}
              side={side}
              selected={selectedPaths.has(node.relativePath)}
              expanded={nodeInteractions.isExpanded(node)}
              loading={nodeInteractions.isLoading(node)}
              dirty={dirtyDisplayPaths.has('') || dirtyDisplayPaths.has(node.relativePath)}
              onClick={(event) => onSelectNode(event, node)}
              onToggle={() => nodeInteractions.toggleNode(node)}
              onDoubleClick={() => nodeInteractions.openNode(node)}
              onContextMenu={(e) => handleContextMenu(e, node)}
              renaming={renaming === node.relativePath}
              renameValue={renameValue}
              onRenameChange={setRenameValue}
              onRenameSubmit={() => handleRenameSubmit(node)}
              onRenameCancel={() => setRenaming(null)}
            />
          ))}
          {visibleNodes.length > 0 && bottomSpacerHeight > 0 && (
            <tr aria-hidden="true">
              <td colSpan={4} className="p-0" style={{ height: `${bottomSpacerHeight}px` }} />
            </tr>
          )}
        </tbody>
      </table>

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

// ─── Side Row ────────────────────────────────────────────────

interface SideRowProps {
  readonly node: TreeNode
  readonly side: Side
  readonly selected: boolean
  readonly expanded: boolean
  readonly loading: boolean
  readonly dirty: boolean
  readonly onClick: (e: React.MouseEvent) => void
  readonly onToggle: () => void
  readonly onDoubleClick: () => void
  readonly onContextMenu: (e: React.MouseEvent) => void
  readonly renaming: boolean
  readonly renameValue: string
  readonly onRenameChange: (v: string) => void
  readonly onRenameSubmit: () => void
  readonly onRenameCancel: () => void
}

function SideRowImpl({ node, side, selected, expanded, loading, dirty, onClick, onToggle, onDoubleClick, onContextMenu, renaming, renameValue, onRenameChange, onRenameSubmit, onRenameCancel }: SideRowProps) {
  const entry = node.entry
  if (!entry) return null

  const fileInfo = side === 'left' ? entry.left : entry.right
  const missingOnSide = !fileInfo
  const showSpinner = shouldShowDirectorySpinner(entry.isDirectory, loading, entry.state)

  return (
    <tr
      className={`h-10 border-b border-neutral-800 select-none ${selected ? SELECTED_ROW_BG : rowBg(entry.state)} ${missingOnSide ? '' : 'cursor-pointer hover:bg-neutral-800/50'}`}
      onClick={missingOnSide ? undefined : onClick}
      onDoubleClick={missingOnSide ? undefined : onDoubleClick}
      onContextMenu={missingOnSide ? undefined : onContextMenu}
    >
      <td className="px-3 py-1 whitespace-nowrap">
        {missingOnSide ? (
          <div className="h-4" />
        ) : (
          <TreeEntryCell
            node={node}
            expanded={expanded}
            loading={showSpinner}
            onToggle={onToggle}
            indentSize={16}
          >
            {renaming ? (
            <input
              type="text"
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onBlur={onRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRenameSubmit()
                if (e.key === 'Escape') onRenameCancel()
              }}
              autoFocus
              className="flex-1 rounded border border-neutral-600 bg-neutral-900 px-1 py-0.5 font-mono text-xs text-neutral-200 outline-none focus:border-blue-500"
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            />
            ) : (
              <span className="font-mono text-xs whitespace-nowrap">{node.name}</span>
            )}
          </TreeEntryCell>
        )}
      </td>
      <td className="px-2 py-1 text-center whitespace-nowrap">
        {!missingOnSide && <StatusBadge state={entry.state} dirty={dirty} />}
      </td>
      <td className="px-2 py-1 text-right text-xs text-neutral-400 whitespace-nowrap tabular-nums">
        {missingOnSide ? '' : fileInfo && !entry.isDirectory ? formatSize(fileInfo.size) : '—'}
      </td>
      <td className="px-2 py-1 text-right text-xs text-neutral-500 whitespace-nowrap tabular-nums">
        {missingOnSide ? '' : fileInfo && !entry.isDirectory ? formatTime(fileInfo.mtime) : '—'}
      </td>
    </tr>
  )
}

// Skip re-render when display-relevant props are unchanged. Callbacks close over `node`
// but only read primitives inside, so callback identity drift is harmless.
const SideRow = memo(SideRowImpl, (prev, next) => {
  if (prev.side !== next.side) return false
  if (prev.selected !== next.selected) return false
  if (prev.expanded !== next.expanded) return false
  if (prev.loading !== next.loading) return false
  if (prev.dirty !== next.dirty) return false
  if (prev.renaming !== next.renaming) return false
  if (prev.renaming && prev.renameValue !== next.renameValue) return false
  if (prev.node.relativePath !== next.node.relativePath) return false
  if (prev.node.entry !== next.node.entry) return false
  return true
})

// ─── Main Component ──────────────────────────────────────────

export default function SplitTree({ entries, filter, onDoubleClickFile, emptyStateMessage = '无匹配项', onExtensionFilterChange, onSourcePathSubmit }: SplitTreeProps) {
  const supportsSync = getRuntimeInfo().supportsSync
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [selection, setSelection] = useState<CompareSelectionState>({ selectedPaths: new Set(), anchorPath: null })
  const visibleNodes = useVisibleCompareNodes({ entries, filter })
  const nodeInteractions = useCompareNodeInteractions(onDoubleClickFile)
  const { leftSource, rightSource, syncTask, setSyncTask } = useCompareStore(useShallow((s) => ({
    leftSource: s.leftSource,
    rightSource: s.rightSource,
    syncTask: s.syncTask,
    setSyncTask: s.setSyncTask,
  })))

  useEffect(() => {
    setSelection((current) => {
      const nextSelectedPaths = new Set(Array.from(current.selectedPaths).filter((path) => visibleNodes.hasPath(path)))
      const nextAnchorPath = current.anchorPath && visibleNodes.hasPath(current.anchorPath) ? current.anchorPath : null

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
    const element = leftRef.current
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

  const handleScroll = useCallback((source: 'left' | 'right') => {
    if (syncing.current) return
    syncing.current = true
    const from = source === 'left' ? leftRef.current : rightRef.current
    const to = source === 'left' ? rightRef.current : leftRef.current
    if (from && to) {
      setScrollTop(from.scrollTop)
      to.scrollTop = from.scrollTop
      to.scrollLeft = from.scrollLeft
    }
    requestAnimationFrame(() => { syncing.current = false })
  }, [])

  const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight } = useMemo(() => {
    if (visibleNodes.length === 0) {
      return { startIndex: 0, endIndex: 0, topSpacerHeight: 0, bottomSpacerHeight: 0 }
    }

    const safeViewportHeight = Math.max(viewportHeight, ROW_HEIGHT)
    const visibleCount = Math.ceil(safeViewportHeight / ROW_HEIGHT)
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS)
    const end = Math.min(visibleNodes.length, start + visibleCount + OVERSCAN_ROWS * 2)

    return {
      startIndex: start,
      endIndex: end,
      topSpacerHeight: start * ROW_HEIGHT,
      bottomSpacerHeight: Math.max(0, (visibleNodes.length - end) * ROW_HEIGHT),
    }
  }, [scrollTop, viewportHeight, visibleNodes.length])

  const handleSelectNode = useCallback((event: React.MouseEvent, node: TreeNode) => {
    setSelection((current) => resolveCompareSelection(current, {
      orderedPaths: event.shiftKey ? visibleNodes.toPathArray() : [],
      clickedPath: node.relativePath,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
    }))
  }, [visibleNodes])

  const selectedCount = selection.selectedPaths.size
  const leftSelectionEntries = useMemo(
    () => collectSyncEntriesForSelection(entries, selection.selectedPaths, 'left_to_right'),
    [entries, selection.selectedPaths],
  )
  const rightSelectionEntries = useMemo(
    () => collectSyncEntriesForSelection(entries, selection.selectedPaths, 'right_to_left'),
    [entries, selection.selectedPaths],
  )

  const handleBatchSync = useCallback(async (direction: SyncDirection) => {
    if (!leftSource || !rightSource) {
      return
    }

    if (!canQueueSyncDirection(syncTask, leftSource, rightSource, direction)) {
      return
    }

    const syncEntries = direction === 'left_to_right' ? leftSelectionEntries : rightSelectionEntries
    if (syncEntries.length === 0) {
      return
    }

    const response = await window.api.startSync({
      leftSource,
      rightSource,
      direction,
      entries: syncEntries,
    })

    if (response.success) {
      useCompareStore.getState().markDirtyPaths(Array.from(selection.selectedPaths))
      rememberSyncDirtyRoots(response.data?.id, getSyncRecompareRootsFromEntries(syncEntries))
      setSyncTask(response.data ?? null)
    }
  }, [leftSelectionEntries, leftSource, rightSelectionEntries, rightSource, selection.selectedPaths, setSyncTask, syncTask])

  return (
    <div className="flex h-full flex-col">
      {/* Fixed headers */}
      <div className="flex shrink-0">
        <PathHeader side="left" onSourcePathSubmit={onSourcePathSubmit} />
        <div className="w-4 shrink-0 border-x border-neutral-600 bg-neutral-700" />
        <PathHeader side="right" onSourcePathSubmit={onSourcePathSubmit} />
      </div>

      {selectedCount > 0 && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-900/50 px-3 py-2 text-xs text-neutral-400">
          <div className="min-w-0 truncate">
            已选 {selectedCount} 项，可按 Shift 连选、按 Cmd/Ctrl 增减选择
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {supportsSync && (
              <>
                <button
                  onClick={() => {
                    void handleBatchSync('left_to_right')
                  }}
                  disabled={leftSelectionEntries.length === 0 || !canQueueSyncDirection(syncTask, leftSource, rightSource, 'left_to_right')}
                  className="inline-flex items-center rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
                >
                  复制所选到右边
                </button>
                <button
                  onClick={() => {
                    void handleBatchSync('right_to_left')
                  }}
                  disabled={rightSelectionEntries.length === 0 || !canQueueSyncDirection(syncTask, leftSource, rightSource, 'right_to_left')}
                  className="inline-flex items-center rounded-md bg-cyan-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
                >
                  复制所选到左边
                </button>
              </>
            )}
            <button
              onClick={() => setSelection({ selectedPaths: new Set(), anchorPath: null })}
              className="inline-flex items-center rounded-md border border-neutral-700 bg-neutral-800/70 px-2.5 py-1 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
            >
              清除选择
            </button>
          </div>
        </div>
      )}

      {/* Two panels with synchronized scroll */}
      <div className="flex flex-1 overflow-hidden">
        <div ref={leftRef} className="flex-1 overflow-auto" onScroll={() => handleScroll('left')}>
          <SideTable
            visibleNodes={visibleNodes}
            entries={entries}
            side="left"
            sourcePath={leftSource?.path ?? ''}
            isLocal={leftSource?.type === 'local'}
            nodeInteractions={nodeInteractions}
            startIndex={startIndex}
            endIndex={endIndex}
            topSpacerHeight={topSpacerHeight}
            bottomSpacerHeight={bottomSpacerHeight}
            emptyStateMessage={emptyStateMessage}
            selectedPaths={selection.selectedPaths}
            onSelectNode={handleSelectNode}
            onExtensionFilterChange={onExtensionFilterChange}
          />
        </div>
        <ScrollGutter scrollRef={leftRef} />
        <div ref={rightRef} className="flex-1 overflow-auto" onScroll={() => handleScroll('right')}>
          <SideTable
            visibleNodes={visibleNodes}
            entries={entries}
            side="right"
            sourcePath={rightSource?.path ?? ''}
            isLocal={rightSource?.type === 'local'}
            nodeInteractions={nodeInteractions}
            startIndex={startIndex}
            endIndex={endIndex}
            topSpacerHeight={topSpacerHeight}
            bottomSpacerHeight={bottomSpacerHeight}
            emptyStateMessage={emptyStateMessage}
            selectedPaths={selection.selectedPaths}
            onSelectNode={handleSelectNode}
            onExtensionFilterChange={onExtensionFilterChange}
          />
        </div>
      </div>
    </div>
  )
}
