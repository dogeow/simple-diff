import type { ReactNode } from 'react'
import type { TreeNode } from '../utils/tree-utils'

interface TreeEntryCellProps {
  readonly node: TreeNode
  readonly expanded: boolean
  readonly loading: boolean
  readonly onToggle: () => void
  readonly indentSize?: number
  readonly children?: ReactNode
}

export default function TreeEntryCell({
  node,
  expanded,
  loading,
  onToggle,
  indentSize = 20,
  children,
}: TreeEntryCellProps) {
  const indent = node.depth * indentSize

  return (
    <div className="flex items-center" style={{ paddingLeft: `${indent}px` }}>
      {node.isDirectory ? (
        loading ? (
          <span className="mr-1 flex h-4 w-4 items-center justify-center">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent text-blue-400" />
          </span>
        ) : (
          <button
            onClick={(event) => {
              event.stopPropagation()
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
      <span className="mr-1.5 text-xs">{node.isDirectory ? '📁' : '📄'}</span>
      {children ?? <span className="font-mono text-xs">{node.name}</span>}
    </div>
  )
}
