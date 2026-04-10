import { useState, useCallback, useRef } from 'react'
import { joinSourcePath } from '@shared/source-path'
import type { CompareEntry, CompareState } from '../../../shared/types'
import { truncatePath, type TreeNode } from '../utils/tree-utils'
import TreeEntryCell from './TreeEntryCell'
import { formatSize, formatTime, rowBg } from './tree-row-utils'
import { useVisibleCompareNodes } from '../hooks/useVisibleCompareNodes'
import { useCompareNodeInteractions, type CompareNodeInteractions } from '../hooks/useCompareNodeInteractions'
import { useCompareStore } from '../stores/compare-store'
import StatusBadge from './StatusBadge'
import ScrollGutter from './ScrollGutter'
import FileContextMenu, { type ContextMenuAction } from './FileContextMenu'

interface SplitTreeProps {
  readonly entries: readonly CompareEntry[]
  readonly filter: CompareState | 'all'
  readonly onDoubleClickFile: (entry: CompareEntry) => void
}

type Side = 'left' | 'right'

// ─── Path Header ─────────────────────────────────────────────

function PathHeader({ side }: { readonly side: Side }) {
  const source = useCompareStore((s) => side === 'left' ? s.leftSource : s.rightSource)
  const setLeftPath = useCompareStore((s) => s.setLeftPath)
  const setRightPath = useCompareStore((s) => s.setRightPath)

  const sourcePath = source?.path ?? ''
  const [editingPath, setEditingPath] = useState(false)
  const [pathInput, setPathInput] = useState(sourcePath)

  const handlePathEdit = useCallback(() => {
    setPathInput(sourcePath)
    setEditingPath(true)
  }, [sourcePath])

  const handlePathSubmit = useCallback(() => {
    const trimmed = pathInput.trim()
    if (trimmed && trimmed !== sourcePath) {
      if (side === 'left') setLeftPath(trimmed)
      else setRightPath(trimmed)
    }
    setEditingPath(false)
  }, [pathInput, sourcePath, side, setLeftPath, setRightPath])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-7 items-center border-b border-neutral-700 bg-neutral-800/80 px-2">
        {editingPath ? (
          <input
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onBlur={handlePathSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handlePathSubmit()
              if (e.key === 'Escape') setEditingPath(false)
            }}
            autoFocus
            className="flex-1 rounded border border-neutral-600 bg-neutral-900 px-1.5 py-0.5 font-mono text-xs text-neutral-200 outline-none focus:border-blue-500"
          />
        ) : (
          <button
            onClick={handlePathEdit}
            className="flex-1 truncate text-left font-mono text-xs text-neutral-400 hover:text-neutral-200"
            title={sourcePath}
          >
            {truncatePath(sourcePath) || '—'}
          </button>
        )}
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
  readonly visibleNodes: readonly TreeNode[]
  readonly side: Side
  readonly sourcePath: string
  readonly isLocal: boolean
  readonly nodeInteractions: CompareNodeInteractions
}

function SideTable({ visibleNodes, side, sourcePath, isLocal, nodeInteractions }: SideTableProps) {
  const removeEntry = useCompareStore((s) => s.removeEntry)
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const buildFullPath = (relativePath: string) => {
    return joinSourcePath(isLocal ? 'local' : 'sftp', sourcePath, relativePath)
  }

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, node })
  }, [])

  const getContextActions = (node: TreeNode): readonly ContextMenuAction[] => {
    if (!isLocal || !node.entry) return []
    const fullPath = buildFullPath(node.relativePath)

    const actions: ContextMenuAction[] = [
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
              removeEntry(node.relativePath)
            }
          }
        },
      },
    ]
    return actions
  }

  const handleRenameSubmit = useCallback(async (node: TreeNode) => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== node.name) {
      const fullPath = buildFullPath(node.relativePath)
      const result = await window.api.renameFile(fullPath, trimmed)
      if (result.success) {
        removeEntry(node.relativePath)
      }
    }
    setRenaming(null)
  }, [renameValue, isLocal, sourcePath, removeEntry])

  return (
    <div>
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-neutral-700 bg-neutral-800 text-xs text-neutral-400">
          <tr>
            <th className="px-3 py-1.5">名称</th>
            <th className="w-14 px-2 py-1.5 text-center">状态</th>
            <th className="w-20 px-2 py-1.5 text-right">大小</th>
            <th className="w-28 px-2 py-1.5 text-right">修改时间</th>
          </tr>
        </thead>
        <tbody>
          {visibleNodes.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-neutral-500 text-xs">
                无匹配项
              </td>
            </tr>
          )}
          {visibleNodes.map((node) => (
            <SideRow
              key={node.relativePath}
              node={node}
              side={side}
              expanded={nodeInteractions.isExpanded(node)}
              loading={nodeInteractions.isLoading(node)}
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
  readonly expanded: boolean
  readonly loading: boolean
  readonly onToggle: () => void
  readonly onDoubleClick: () => void
  readonly onContextMenu: (e: React.MouseEvent) => void
  readonly renaming: boolean
  readonly renameValue: string
  readonly onRenameChange: (v: string) => void
  readonly onRenameSubmit: () => void
  readonly onRenameCancel: () => void
}

function SideRow({ node, side, expanded, loading, onToggle, onDoubleClick, onContextMenu, renaming, renameValue, onRenameChange, onRenameSubmit, onRenameCancel }: SideRowProps) {
  const entry = node.entry
  if (!entry) return null

  const fileInfo = side === 'left' ? entry.left : entry.right

  return (
    <tr
      className={`border-b border-neutral-800 hover:bg-neutral-800/50 cursor-pointer select-none ${rowBg(entry.state)}`}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <td className="px-3 py-1">
        <TreeEntryCell
          node={node}
          expanded={expanded}
          loading={loading}
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
            <span className="font-mono text-xs truncate">{node.name}</span>
          )}
        </TreeEntryCell>
      </td>
      <td className="px-2 py-1 text-center">
        <StatusBadge state={entry.state} />
      </td>
      <td className="px-2 py-1 text-right text-xs text-neutral-400">
        {fileInfo && !entry.isDirectory ? formatSize(fileInfo.size) : '—'}
      </td>
      <td className="px-2 py-1 text-right text-xs text-neutral-500">
        {fileInfo && !entry.isDirectory ? formatTime(fileInfo.mtime) : '—'}
      </td>
    </tr>
  )
}

// ─── Main Component ──────────────────────────────────────────

export default function SplitTree({ entries, filter, onDoubleClickFile }: SplitTreeProps) {
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)
  const leftVisibleNodes = useVisibleCompareNodes({ entries, filter, side: 'left' })
  const rightVisibleNodes = useVisibleCompareNodes({ entries, filter, side: 'right' })
  const nodeInteractions = useCompareNodeInteractions(onDoubleClickFile)
  const leftSource = useCompareStore((s) => s.leftSource)
  const rightSource = useCompareStore((s) => s.rightSource)

  const handleScroll = useCallback((source: 'left' | 'right') => {
    if (syncing.current) return
    syncing.current = true
    const from = source === 'left' ? leftRef.current : rightRef.current
    const to = source === 'left' ? rightRef.current : leftRef.current
    if (from && to) {
      to.scrollTop = from.scrollTop
    }
    requestAnimationFrame(() => { syncing.current = false })
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* Fixed headers */}
      <div className="flex shrink-0">
        <PathHeader side="left" />
        <div className="w-4 shrink-0 border-x border-neutral-600 bg-neutral-700" />
        <PathHeader side="right" />
      </div>

      {/* Two panels with synchronized scroll */}
      <div className="flex flex-1 overflow-hidden">
        <div ref={leftRef} className="flex-1 overflow-auto" onScroll={() => handleScroll('left')}>
          <SideTable
            visibleNodes={leftVisibleNodes}
            side="left"
            sourcePath={leftSource?.path ?? ''}
            isLocal={leftSource?.type === 'local'}
            nodeInteractions={nodeInteractions}
          />
        </div>
        <ScrollGutter scrollRef={leftRef} />
        <div ref={rightRef} className="flex-1 overflow-auto" onScroll={() => handleScroll('right')}>
          <SideTable
            visibleNodes={rightVisibleNodes}
            side="right"
            sourcePath={rightSource?.path ?? ''}
            isLocal={rightSource?.type === 'local'}
            nodeInteractions={nodeInteractions}
          />
        </div>
      </div>
    </div>
  )
}
