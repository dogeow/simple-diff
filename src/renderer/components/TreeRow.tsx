import type { TreeNode } from '../utils/tree-utils'
import TreeEntryCell from './TreeEntryCell'
import StatusBadge from './StatusBadge'
import { formatSize, formatTime, rowBg } from './tree-row-utils'

interface TreeRowProps {
  readonly node: TreeNode
  readonly expanded: boolean
  readonly loading: boolean
  readonly onToggle: () => void
  readonly onDoubleClick: () => void
}

export default function TreeRow({ node, expanded, loading, onToggle, onDoubleClick }: TreeRowProps) {
  const entry = node.entry
  if (!entry) return null

  return (
    <tr
      className={`border-b border-neutral-800 hover:bg-neutral-800/50 cursor-pointer select-none ${rowBg(entry.state)}`}
      onDoubleClick={onDoubleClick}
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
          loading={loading}
          onToggle={onToggle}
        />
      </td>
      {/* Status */}
      <td className="px-2 py-1.5 text-center">
        <StatusBadge state={entry.state} />
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
