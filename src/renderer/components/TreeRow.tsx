import type { TreeNode } from '../utils/tree-utils'
import TreeEntryCell from './TreeEntryCell'
import StatusBadge from './StatusBadge'
import { formatSize, formatTime, rowBg, shouldShowDirectorySpinner } from './tree-row-utils'
import type { MouseEvent } from 'react'

interface TreeRowProps {
  readonly node: TreeNode
  readonly expanded: boolean
  readonly loading: boolean
  readonly dirty?: boolean
  readonly selected?: boolean
  readonly onClick?: (event: MouseEvent<HTMLTableRowElement>) => void
  readonly onToggle: () => void
  readonly onDoubleClick: () => void
  readonly onContextMenu?: (event: MouseEvent<HTMLTableRowElement>) => void
}

export default function TreeRow({ node, expanded, loading, dirty = false, selected = false, onClick, onToggle, onDoubleClick, onContextMenu }: TreeRowProps) {
  const entry = node.entry
  if (!entry) return null

  const showSpinner = shouldShowDirectorySpinner(entry.isDirectory, loading, entry.state)

  return (
    <tr
      className={`group/row cursor-pointer select-none border-b border-neutral-800/70 transition-colors hover:bg-neutral-800/60 ${selected ? 'bg-blue-500/12 ring-1 ring-inset ring-blue-500/30' : rowBg(entry.state)}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {/* Left size */}
      <td className="border-r border-neutral-800/50 px-2 py-1.5 text-right text-xs text-neutral-400">
        {entry.left && !entry.isDirectory ? formatSize(entry.left.size) : '—'}
      </td>
      {/* Left mtime */}
      <td className="border-r border-neutral-800/50 px-2 py-1.5 text-right text-xs text-neutral-500">
        {entry.left && !entry.isDirectory ? formatTime(entry.left.mtime) : '—'}
      </td>
      {/* Name */}
      <td className="px-3 py-1.5">
        <TreeEntryCell
          node={node}
          expanded={expanded}
          loading={showSpinner}
          onToggle={onToggle}
        />
      </td>
      {/* Status */}
      <td className="px-2 py-1.5 text-center">
        <StatusBadge state={entry.state} dirty={dirty} />
      </td>
      {/* Right size */}
      <td className="border-l border-neutral-800/50 px-2 py-1.5 text-right text-xs text-neutral-400">
        {entry.right && !entry.isDirectory ? formatSize(entry.right.size) : '—'}
      </td>
      {/* Right mtime */}
      <td className="border-l border-neutral-800/50 px-2 py-1.5 text-right text-xs text-neutral-500">
        {entry.right && !entry.isDirectory ? formatTime(entry.right.mtime) : '—'}
      </td>
    </tr>
  )
}
