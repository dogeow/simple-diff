import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { CompareEntry, CompareFilter } from '../../../shared/types'
import { type TreeNode, type VisibleTreeNodes } from '../utils/tree-utils'
import CompareTreeEmpty from './CompareTreeEmpty'
import CompareTreeRow, { META_GAP, SIZE_COLUMN, STATUS_COLUMN, TIME_COLUMN } from './CompareTreeRow'
import { TREE_OVERSCAN_ROWS, TREE_ROW_HEIGHT } from './tree-row-utils'
import { useVisibleCompareNodes } from '../hooks/useVisibleCompareNodes'
import { useCompareNodeInteractions, type CompareNodeInteractions } from '../hooks/useCompareNodeInteractions'
import { useCompareRowActions, type CompareRowActions } from '../hooks/useCompareRowActions'
import { useTreeKeyboardNav } from '../hooks/useTreeKeyboardNav'
import { useCompareStore } from '../stores/compare-store'
import { useSSHStore } from '../stores/ssh-store'
import ScrollGutter from './ScrollGutter'
import { resolveCompareSelection } from '../utils/compare-selection'
import { formatSourceTag } from '../utils/source-label'
import { useUIStore } from '../stores/ui-store'
import { Input, SplitPane, type MenuItem } from './ui'
import { cn } from '../lib/utils'

interface SplitTreeProps {
  readonly entries: readonly CompareEntry[]
  readonly filter: CompareFilter
  readonly onDoubleClickFile: (entry: CompareEntry) => void
  readonly emptyStateMessage?: string
  readonly onExtensionFilterChange?: (filter: readonly string[]) => void | Promise<void>
  readonly onSourcePathSubmit?: (side: Side, path: string) => void | Promise<void>
}

type Side = 'left' | 'right'

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
  const [pathInput, setPathInput] = useState(sourcePath)

  useEffect(() => {
    if (source?.type === 'sftp' && configs.length === 0) {
      void loadConfigs()
    }
  }, [configs.length, loadConfigs, source])

  useEffect(() => {
    setPathInput(sourcePath)
  }, [sourcePath])

  const handlePathSubmit = useCallback(() => {
    const trimmed = pathInput.trim()
    if (!trimmed) {
      setPathInput(sourcePath)
      return
    }

    if (trimmed !== sourcePath) {
      void onSourcePathSubmit?.(side, trimmed)
    }
  }, [onSourcePathSubmit, pathInput, sourcePath, side])

  const sideBadgeClass = side === 'left'
    ? 'bg-chart-3/15 text-chart-3'
    : 'bg-chart-2/15 text-chart-2'
  const sourceTag = source ? formatSourceTag(source, configs) : side === 'left' ? '左侧' : '右侧'

  return (
    // 表头现在住在各自那一栏里（见下面的 `SplitPane`），所以它是列方向上的固定行，
    // 不再是行方向上的 `flex-1`——分隔条拖到哪里，表头的边界就在哪里。
    <div className="flex min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b border-border bg-surface px-2 py-1.5">
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold uppercase ${sideBadgeClass}`}>
        {side === 'left' ? 'L' : 'R'}
      </span>
      <span className="max-w-[10rem] shrink-0 truncate text-xs text-fg-muted">{sourceTag}</span>
      <Input
        size="sm"
        mono
        aria-label={side === 'left' ? '左侧路径' : '右侧路径'}
        value={pathInput}
        onChange={(e) => setPathInput(e.target.value)}
        onBlur={handlePathSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handlePathSubmit()
          if (e.key === 'Escape') {
            setPathInput(sourcePath)
            e.currentTarget.blur()
          }
        }}
        wrapperClassName="min-w-0 flex-1"
        spellCheck={false}
      />
    </div>
  )
}

// ─── Side Table ──────────────────────────────────────────────

interface SideTableProps {
  readonly visibleNodes: VisibleTreeNodes
  readonly side: Side
  readonly nodeInteractions: CompareNodeInteractions
  readonly startIndex: number
  readonly endIndex: number
  readonly topSpacerHeight: number
  readonly bottomSpacerHeight: number
  readonly selectedPaths: ReadonlySet<string>
  readonly focusedIndex: number
  readonly onFocusIndex: (index: number) => void
  readonly onTreeKeyDown: (event: React.KeyboardEvent) => void
  readonly onSelectNode: (event: React.MouseEvent, node: TreeNode) => void
  readonly buildActions: (node: TreeNode) => MenuItem[]
  readonly rowActions: CompareRowActions
  readonly scanning: boolean
}

function SideTable({
  visibleNodes,
  side,
  nodeInteractions,
  startIndex,
  endIndex,
  topSpacerHeight,
  bottomSpacerHeight,
  selectedPaths,
  focusedIndex,
  onFocusIndex,
  onTreeKeyDown,
  onSelectNode,
  buildActions,
  rowActions,
  scanning,
}: SideTableProps) {
  const dirtyDisplayPaths = useCompareStore((s) => s.dirtyDisplayPaths)
  const renderedNodes = visibleNodes.slice(startIndex, endIndex)

  return (
    <div aria-busy={scanning || undefined}>
      <div className="sticky top-0 z-sticky flex h-row-tree items-center gap-1.5 border-b border-border bg-surface-2 pr-1 pl-2 text-2xs font-medium tracking-wider text-fg-muted uppercase">
        <span className="min-w-0 flex-1 truncate">名称</span>
        <span className={cn('flex items-center', META_GAP)}>
          <span className={cn('shrink-0 text-right', SIZE_COLUMN)}>大小</span>
          <span className={cn('shrink-0 text-right', TIME_COLUMN)}>修改时间</span>
          <span className={cn('shrink-0 text-center', STATUS_COLUMN)}>状态</span>
        </span>
      </div>

      <div
        role="tree"
        aria-label={side === 'left' ? '左侧目录' : '右侧目录'}
        aria-multiselectable
        onKeyDown={onTreeKeyDown}
      >
        {topSpacerHeight > 0 && <div aria-hidden="true" style={{ height: `${topSpacerHeight}px` }} />}
        {renderedNodes.map((node, offset) => {
          const index = startIndex + offset
          return (
            <CompareTreeRow
              key={node.relativePath}
              node={node}
              side={side}
              index={index}
              setSize={visibleNodes.length}
              expanded={nodeInteractions.isExpanded(node)}
              loading={nodeInteractions.isLoading(node)}
              dirty={dirtyDisplayPaths.has('') || dirtyDisplayPaths.has(node.relativePath)}
              selected={selectedPaths.has(node.relativePath)}
              focused={index === focusedIndex}
              onSelect={(event) => {
                onFocusIndex(index)
                onSelectNode(event, node)
              }}
              onToggle={() => nodeInteractions.toggleNode(node)}
              onActivate={() => nodeInteractions.activateNode(node)}
              buildActions={buildActions}
              renaming={rowActions.renamingPath === node.relativePath}
              renameValue={rowActions.renameValue}
              onRenameChange={rowActions.setRenameValue}
              onRenameSubmit={() => rowActions.submitRename(node)}
              onRenameCancel={rowActions.cancelRename}
            />
          )
        })}
        {bottomSpacerHeight > 0 && <div aria-hidden="true" style={{ height: `${bottomSpacerHeight}px` }} />}
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────

/**
 * chunk 7：两侧的行不再各写一份。`SideRow`（4 列 `<tr>`，40px）和合并视图的
 * `TreeRow`（6 列 `<tr>`）合并成一个 `CompareTreeRow`，`side` 决定画哪几列元数据；
 * 行高降到 `--ds-row-tree`（24px），差异符号、`treeitem` ARIA、方向键导航、
 * 右键菜单和常驻 `⋯` 两侧同款。
 */
export default function SplitTree({ entries, filter, onDoubleClickFile, emptyStateMessage = '无匹配项', onExtensionFilterChange, onSourcePathSubmit }: SplitTreeProps) {
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  // 选择态提到 `ui-store`：状态栏的选择槽位与合并视图共用同一份（设计蓝图 §4.1）。
  const selection = useUIStore((s) => s.treeSelection)
  const setSelection = useUIStore((s) => s.setTreeSelection)
  const visibleNodes = useVisibleCompareNodes({ entries, filter })
  const nodeInteractions = useCompareNodeInteractions(onDoubleClickFile)
  const scanning = useCompareStore((s) => s.scanning)

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

  // 空态时两栏是不挂载的，所以这个 effect 必须跟着「有没有行」重跑一次——
  // 否则首批结果到达后 `viewportHeight` 会一直停在 0，虚拟窗口只渲染一屏的量。
  const hasRows = visibleNodes.length > 0

  useEffect(() => {
    const element = leftRef.current
    if (!element) return

    const update = () => {
      setViewportHeight(element.clientHeight)
      setScrollTop(element.scrollTop)
    }

    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasRows])

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

  const renderedWindow = useMemo(() => {
    if (visibleNodes.length === 0) {
      return { startIndex: 0, endIndex: 0, topSpacerHeight: 0, bottomSpacerHeight: 0 }
    }

    const safeViewportHeight = Math.max(viewportHeight, TREE_ROW_HEIGHT)
    const visibleCount = Math.ceil(safeViewportHeight / TREE_ROW_HEIGHT)
    const start = Math.max(0, Math.floor(scrollTop / TREE_ROW_HEIGHT) - TREE_OVERSCAN_ROWS)
    const end = Math.min(visibleNodes.length, start + visibleCount + TREE_OVERSCAN_ROWS * 2)

    return {
      startIndex: start,
      endIndex: end,
      topSpacerHeight: start * TREE_ROW_HEIGHT,
      bottomSpacerHeight: Math.max(0, (visibleNodes.length - end) * TREE_ROW_HEIGHT),
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

  const rowActions = useCompareRowActions({
    onExtensionFilterChange,
    onOpenNode: nodeInteractions.openNode,
  })
  const buildLeftActions = rowActions.buildActionsFor('left')
  const buildRightActions = rowActions.buildActionsFor('right')

  // 两栏是同一棵树的两个投影，共用一个焦点下标；滚动本来也是同步的。
  const keyboard = useTreeKeyboardNav({
    nodes: visibleNodes,
    viewportRef: leftRef,
    rowHeight: TREE_ROW_HEIGHT,
    renderedRange: renderedWindow,
    isExpanded: nodeInteractions.isExpanded,
    onToggle: nodeInteractions.toggleNode,
  })
  const focusedIndex = keyboard.focusedIndex < 0 ? 0 : keyboard.focusedIndex

  const sharedTableProps = {
    visibleNodes,
    nodeInteractions,
    startIndex: renderedWindow.startIndex,
    endIndex: renderedWindow.endIndex,
    topSpacerHeight: renderedWindow.topSpacerHeight,
    bottomSpacerHeight: renderedWindow.bottomSpacerHeight,
    selectedPaths: selection.selectedPaths,
    focusedIndex,
    onFocusIndex: keyboard.setFocusedIndex,
    onTreeKeyDown: keyboard.onKeyDown,
    onSelectNode: handleSelectNode,
    rowActions,
    scanning,
  }

  return (
    <div className="flex h-full flex-col">
      {/*
        §4.3：两栏宽度可调。表头和树在同一个 `SplitPane` 里，各自属于自己那一栏，
        所以分隔条动的时候表头边界跟着动——以前表头用 `flex-1` 对半分、树用另一套
        `flex-1` 加 12px 装订线，两者本来就差着几个像素。

        `SplitPane` 无论有没有行都挂着（只是有行时才长出树），这样首批结果到达
        不会重挂组件、比例也不会被重置。滚动同步、虚拟窗口、`ScrollGutter` 全部原样：
        装订线仍旧是左栏内容区的邻居，高度等于内容区，标记的百分比坐标不受影响。
      */}
      <SplitPane
        className={hasRows ? 'min-h-0 flex-1' : 'shrink-0'}
        storageKey="compare-split"
        min={240}
        label="调整左右目录栏宽度"
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <PathHeader side="left" onSourcePathSubmit={onSourcePathSubmit} />
          {hasRows && (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div ref={leftRef} className="min-w-0 flex-1 overflow-auto" onScroll={() => handleScroll('left')}>
                <SideTable {...sharedTableProps} side="left" buildActions={buildLeftActions} />
              </div>
              <ScrollGutter scrollRef={leftRef} />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <PathHeader side="right" onSourcePathSubmit={onSourcePathSubmit} />
          {hasRows && (
            <div ref={rightRef} className="min-h-0 flex-1 overflow-auto" onScroll={() => handleScroll('right')}>
              <SideTable {...sharedTableProps} side="right" buildActions={buildRightActions} />
            </div>
          )}
        </div>
      </SplitPane>

      {/*
        没有行时，空态跨两栏画一次而不是每栏一份——§7.6 要求空态带动作，
        并排两个一模一样的「重新对比」按钮只会让人犹豫按哪个。
      */}
      {!hasRows && (
        <div className="min-h-0 flex-1 overflow-auto" aria-busy={scanning || undefined}>
          <CompareTreeEmpty message={emptyStateMessage} onExtensionFilterChange={onExtensionFilterChange} />
        </div>
      )}

      {rowActions.dialogs}
    </div>
  )
}
