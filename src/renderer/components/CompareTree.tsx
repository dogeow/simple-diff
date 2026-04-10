import { useMemo, useCallback } from 'react'
import type { CompareEntry, CompareState } from '../../../shared/types'
import { useCompareNodeInteractions } from '../hooks/useCompareNodeInteractions'
import { useVisibleCompareNodes } from '../hooks/useVisibleCompareNodes'
import { useCompareStore, computeStats } from '../stores/compare-store'
import CompareToolbar from './CompareToolbar'
import TreeRow from './TreeRow'

interface CompareTreeProps {
  readonly entries: readonly CompareEntry[]
  readonly filter: CompareState | 'all'
  readonly onFilterChange: (filter: CompareState | 'all') => void
  readonly onDoubleClickFile: (entry: CompareEntry) => void
  readonly toolbarOnly?: boolean
}

export default function CompareTree({ entries, filter, onFilterChange, onDoubleClickFile, toolbarOnly = false }: CompareTreeProps) {
  const expandedDirs = useCompareStore((s) => s.expandedDirs)
  const expandAll = useCompareStore((s) => s.expandAll)
  const collapseAll = useCompareStore((s) => s.collapseAll)
  const nodeInteractions = useCompareNodeInteractions(onDoubleClickFile)

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

  const stats = useMemo(() => computeStats(entries), [entries])
  const pendingCount = useMemo(() => entries.filter((e) => e.state === 'pending' || e.state === 'comparing').length, [entries])
  const visibleNodes = useVisibleCompareNodes({ entries, filter })

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
        extensionFilter={extensionFilter}
        setExtensionFilter={setExtensionFilter}
        hideDot={hideDot}
        setHideDot={setHideDot}
        hideDotFilter={hideDotFilter}
        setHideDotFilter={setHideDotFilter}
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
                  无匹配项
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
              />
            ))}
          </tbody>
        </table>
      </div>}
    </div>
  )
}
