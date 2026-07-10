import type { CompareEntry } from '../../../shared/types'
import { useCompareStore } from '../stores/compare-store'
import { useAppStore } from '../stores/app-store'
import CompareTree from './CompareTree'
import SplitTree from './SplitTree'
import FileDiffView from './FileDiffView'

export interface ComparePageContentProps {
  readonly onDoubleClickFile: (entry: CompareEntry) => void
  readonly onRerunCompare: () => Promise<void>
  readonly onExtensionFilterChange: (nextFilters: readonly string[]) => Promise<void>
  readonly onSourcePathSubmit: (side: 'left' | 'right', nextPath: string) => Promise<void>
}

function DirectoryCompareContent({
  onDoubleClickFile,
  onRerunCompare,
  onExtensionFilterChange,
  onSourcePathSubmit,
}: ComparePageContentProps) {
  const entries = useCompareStore((state) => state.entries)
  const scanning = useCompareStore((state) => state.scanning)
  const filter = useCompareStore((state) => state.filter)
  const setFilter = useCompareStore((state) => state.setFilter)
  const viewMode = useCompareStore((state) => state.viewMode)

  const emptyStateMessage = scanning ? '正在扫描目录，等待首批目录…' : '无匹配项'

  if (viewMode === 'split') {
    return (
      <div className="h-full p-3">
        <div className="flex h-full flex-col gap-2">
          <CompareTree
            entries={entries}
            filter={filter}
            onFilterChange={setFilter}
            onDoubleClickFile={onDoubleClickFile}
            toolbarOnly
            onRerunCompare={onRerunCompare}
            onExtensionFilterChange={onExtensionFilterChange}
          />
          <SplitTree
            entries={entries}
            filter={filter}
            onDoubleClickFile={onDoubleClickFile}
            emptyStateMessage={emptyStateMessage}
            onExtensionFilterChange={onExtensionFilterChange}
            onSourcePathSubmit={onSourcePathSubmit}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full p-3">
      <CompareTree
        entries={entries}
        filter={filter}
        onFilterChange={setFilter}
        onDoubleClickFile={onDoubleClickFile}
        emptyStateMessage={emptyStateMessage}
        onRerunCompare={onRerunCompare}
        onExtensionFilterChange={onExtensionFilterChange}
      />
    </div>
  )
}

function ActiveDiffContent() {
  const activeTab = useAppStore((state) => {
    if (state.activeDiffTabId === null) {
      return null
    }

    return state.diffTabs.find((tab) => tab.id === state.activeDiffTabId) ?? null
  })

  if (!activeTab) {
    return null
  }

  return <FileDiffView tab={activeTab} />
}

export default function ComparePageContent(props: ComparePageContentProps) {
  const hasActiveDiffTab = useAppStore((state) => state.activeDiffTabId !== null)

  if (hasActiveDiffTab) {
    return <ActiveDiffContent />
  }

  return <DirectoryCompareContent {...props} />
}
