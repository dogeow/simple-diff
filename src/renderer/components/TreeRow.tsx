import type { CompareState } from '../../../shared/types'
import type { TreeNode } from '../utils/tree-utils'
import StatusBadge from './StatusBadge'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function rowBg(state: CompareState): string {
  switch (state) {
    case 'different': return 'bg-yellow-900/10'
    case 'left_only': return 'bg-blue-900/10'
    case 'right_only': return 'bg-purple-900/10'
    case 'comparing': return 'bg-blue-900/5'
    default: return ''
  }
}

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

  const indent = node.depth * 20

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
        <div className="flex items-center" style={{ paddingLeft: `${indent}px` }}>
          {node.isDirectory ? (
            loading ? (
              <span className="mr-1 flex h-4 w-4 items-center justify-center">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent text-blue-400" />
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle()
                }}
                className="mr-1 flex h-4 w-4 items-center justify-center text-xs text-neutral-400 hover:text-neutral-200"
              >
                {expanded ? '▼' : '▶'}
              </button>
            )
          ) : (
            <span className="mr-1 w-4" />
          )}
          <span className="mr-1.5 text-xs">
            {node.isDirectory ? '📁' : '📄'}
          </span>
          <span className="font-mono text-xs">{node.name}</span>
        </div>
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
