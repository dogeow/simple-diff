import type { ReactNode } from 'react'
import type { TreeNode } from '../utils/tree-utils'
import { ChevronDownIcon, ChevronRightIcon, FolderIcon } from './Icons'

interface TreeEntryCellProps {
  readonly node: TreeNode
  readonly expanded: boolean
  readonly loading: boolean
  readonly onToggle: () => void
  readonly indentSize?: number
  readonly children?: ReactNode
}

function FileGlyph() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  )
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
    <div className="flex min-w-0 items-center" style={{ paddingLeft: `${indent}px` }}>
      {node.isDirectory ? (
        loading ? (
          <span className="mr-1 flex h-4 w-4 items-center justify-center">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
          </span>
        ) : (
          <button
            onClick={(event) => {
              event.stopPropagation()
              onToggle()
            }}
            aria-label={expanded ? '收起' : '展开'}
            className="mr-1 flex h-4 w-4 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-700/60 hover:text-neutral-200"
          >
            {expanded ? <ChevronDownIcon width={11} height={11} /> : <ChevronRightIcon width={11} height={11} />}
          </button>
        )
      ) : (
        <span className="mr-1 w-4" aria-hidden="true" />
      )}
      <span className={`mr-1.5 flex h-4 w-4 shrink-0 items-center justify-center ${node.isDirectory ? 'text-blue-300/80' : 'text-neutral-500'}`}>
        {node.isDirectory ? <FolderIcon width={12} height={12} /> : <FileGlyph />}
      </span>
      {children ?? <span className="min-w-0 truncate font-mono text-xs whitespace-nowrap">{node.name}</span>}
    </div>
  )
}
