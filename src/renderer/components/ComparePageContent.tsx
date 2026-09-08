import type { CompareEntry } from '../../../shared/types'
import { useCompareStore } from '../stores/compare-store'
import { useAppStore } from '../stores/app-store'
import CompareTree from './CompareTree'
import SplitTree from './SplitTree'
import FileDiffView from './FileDiffView'

export interface ComparePageContentProps {
  readonly onDoubleClickFile: (entry: CompareEntry) => void
  readonly onExtensionFilterChange: (nextFilters: readonly string[]) => Promise<void>
  readonly onSourcePathSubmit: (side: 'left' | 'right', nextPath: string) => Promise<void>
}

/**
 * chunk 6：工具栏搬到了 `ComparePage`，所以这里只剩“哪个树”这一个决定。
 * 分栏视图以前要挂一次 `CompareTree toolbarOnly` 只为借它的工具栏——那份重复没了。
 */
function DirectoryCompareContent({
  onDoubleClickFile,
  onExtensionFilterChange,
  onSourcePathSubmit,
}: ComparePageContentProps) {
  const entries = useCompareStore((state) => state.entries)
  const scanning = useCompareStore((state) => state.scanning)
  const filter = useCompareStore((state) => state.filter)
  const viewMode = useCompareStore((state) => state.viewMode)

  const emptyStateMessage = scanning ? '正在扫描目录，等待首批目录…' : '无匹配项'

  if (viewMode === 'split') {
    return (
      <div className="h-full p-2">
        <SplitTree
          entries={entries}
          filter={filter}
          onDoubleClickFile={onDoubleClickFile}
          emptyStateMessage={emptyStateMessage}
          onExtensionFilterChange={onExtensionFilterChange}
          onSourcePathSubmit={onSourcePathSubmit}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-2">
      <CompareTree
        entries={entries}
        filter={filter}
        onDoubleClickFile={onDoubleClickFile}
        emptyStateMessage={emptyStateMessage}
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

  return <FileDiffView key={activeTab.sessionId} tab={activeTab} />
}

export default function ComparePageContent(props: ComparePageContentProps) {
  const hasActiveDiffTab = useAppStore((state) => state.activeDiffTabId !== null)

  if (hasActiveDiffTab) {
    return <ActiveDiffContent />
  }

  return <DirectoryCompareContent {...props} />
}
