import { useCallback } from 'react'
import { useCompareStore } from '../stores/compare-store'
import { useAppStore, type DiffTab } from '../stores/app-store'
import CompareTree from '../components/CompareTree'
import SplitTree from '../components/SplitTree'
import FileDiffView from '../components/FileDiffView'
import type { CompareEntry } from '../../../shared/types'

function joinPath(root: string, relative: string): string {
  if (root.endsWith('/')) return root + relative
  return root + '/' + relative
}

export default function ComparePage() {
  const entries = useCompareStore((s) => s.entries)
  const scanning = useCompareStore((s) => s.scanning)
  const comparing = useCompareStore((s) => s.comparing)
  const done = useCompareStore((s) => s.done)
  const duration = useCompareStore((s) => s.duration)
  const leftSource = useCompareStore((s) => s.leftSource)
  const rightSource = useCompareStore((s) => s.rightSource)
  const filter = useCompareStore((s) => s.filter)
  const setFilter = useCompareStore((s) => s.setFilter)
  const viewMode = useCompareStore((s) => s.viewMode)
  const setViewMode = useCompareStore((s) => s.setViewMode)
  const resetCompare = useCompareStore((s) => s.resetCompare)
  const setPage = useAppStore((s) => s.setPage)
  const diffTabs = useAppStore((s) => s.diffTabs)
  const activeDiffTabId = useAppStore((s) => s.activeDiffTabId)
  const { addDiffTab, closeDiffTab, setActiveDiffTab, updateDiffTab, clearDiffTabs } = useAppStore()

  const activeTab = diffTabs.find((t) => t.id === activeDiffTabId) ?? null

  const handleBack = async () => {
    await window.api.cancelCompare()
    clearDiffTabs()
    resetCompare()
    setPage('home')
  }

  const handleDoubleClickFile = useCallback(
    async (entry: CompareEntry) => {
      if (!leftSource && !rightSource) return

      const leftRoot = leftSource?.path ?? ''
      const rightRoot = rightSource?.path ?? ''

      const leftFullPath = entry.left ? joinPath(leftRoot, entry.relativePath) : ''
      const rightFullPath = entry.right ? joinPath(rightRoot, entry.relativePath) : ''

      const tabId = entry.relativePath

      // Check if tab already open
      const existing = diffTabs.find((t) => t.id === tabId)
      if (existing) {
        setActiveDiffTab(tabId)
        return
      }

      // Create loading tab
      const newTab: DiffTab = {
        id: tabId,
        relativePath: entry.relativePath,
        fileName: entry.name,
        leftSource: leftSource ?? null,
        rightSource: rightSource ?? null,
        leftFullPath,
        rightFullPath,
        leftContent: '',
        rightContent: '',
        originalLeftContent: '',
        originalRightContent: '',
        diffResult: null,
        loading: true,
      }
      addDiffTab(newTab)

      // Read file contents
      let leftContent = ''
      let rightContent = ''

      if (entry.left && leftSource) {
        const res = await window.api.readText(leftSource, leftFullPath)
        if (res.success && res.data != null) leftContent = res.data
      }

      if (entry.right && rightSource) {
        const res = await window.api.readText(rightSource, rightFullPath)
        if (res.success && res.data != null) rightContent = res.data
      }

      // Compute diff
      const diffRes = await window.api.textDiff(leftContent, rightContent)

      updateDiffTab(tabId, {
        leftContent,
        rightContent,
        originalLeftContent: leftContent,
        originalRightContent: rightContent,
        diffResult: diffRes.success ? diffRes.data : null,
        loading: false,
      })
    },
    [leftSource, rightSource, diffTabs, addDiffTab, setActiveDiffTab, updateDiffTab],
  )

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-neutral-700 bg-neutral-800 px-3 py-2">
        <button
          onClick={handleBack}
          className="rounded bg-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-600"
        >
          ← 退出对比
        </button>

        {/* Tab bar */}
        <div className="flex gap-0.5 overflow-x-auto">
          <button
            onClick={() => setActiveDiffTab(null)}
            className={`rounded-t px-3 py-1 text-xs font-medium transition-colors ${
              activeDiffTabId === null
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
            }`}
          >
            目录树
          </button>
          {diffTabs.map((tab) => (
            <div key={tab.id} className="group flex items-center">
              <button
                onClick={() => setActiveDiffTab(tab.id)}
                className={`rounded-t-l px-3 py-1 text-xs font-medium transition-colors ${
                  activeDiffTabId === tab.id
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                }`}
              >
                {tab.fileName}
                {tab.leftContent !== tab.originalLeftContent || tab.rightContent !== tab.originalRightContent
                  ? ' ●'
                  : ''}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeDiffTab(tab.id)
                }}
                className="rounded-t-r bg-neutral-700 px-1.5 py-1 text-xs text-neutral-400 hover:bg-neutral-600 hover:text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Status indicator */}
        <div className="ml-auto flex items-center gap-3 text-xs text-neutral-400">
          {scanning && (
            <span className="flex items-center gap-1.5 text-blue-400">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              扫描中…
            </span>
          )}
          {comparing && (
            <span className="flex items-center gap-1.5 text-blue-400">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              对比中…
            </span>
          )}
          {done && <span className="text-green-400">✓ 完成 {duration}ms</span>}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab ? (
          <FileDiffView tab={activeTab} />
        ) : scanning && entries.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-neutral-400">
              <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-neutral-600 border-t-blue-400" />
              <span className="text-sm">正在扫描目录…</span>
            </div>
          </div>
        ) : viewMode === 'split' ? (
          <div className="h-full p-3">
            <div className="flex h-full flex-col gap-2">
              {/* Shared toolbar for split mode */}
              <CompareTree
                entries={entries}
                filter={filter}
                onFilterChange={setFilter}
                onDoubleClickFile={handleDoubleClickFile}
                toolbarOnly
              />
              <SplitTree
                entries={entries}
                filter={filter}
                onDoubleClickFile={handleDoubleClickFile}
              />
            </div>
          </div>
        ) : (
          <div className="h-full p-3">
            <CompareTree
              entries={entries}
              filter={filter}
              onFilterChange={setFilter}
              onDoubleClickFile={handleDoubleClickFile}
            />
          </div>
        )}
      </div>
    </div>
  )
}
