import SourceSelector from '../components/SourceSelector'
import FilterModal from '../components/FilterModal'
import CompareSessionTabs from '../components/CompareSessionTabs'
import { useShallow } from 'zustand/react/shallow'
import { useCompareStore } from '../stores/compare-store'
import { useCompareActions } from '../hooks/useCompare'
import { useAppStore } from '../stores/app-store'
import { useSettingsStore } from '../stores/settings-store'
import { openCompareTab, openSyncTaskView } from '../utils/compare-session-navigation'
import { formatSyncProgress } from '../utils/format-sync-progress'
import type { StrategyName } from '../../../shared/types'

const STRATEGY_OPTIONS: { value: StrategyName; label: string }[] = [
  { value: 'size', label: '文件大小' },
  { value: 'mtime', label: '修改时间' },
  { value: 'quick_hash', label: '快速内容签名' },
  { value: 'hash', label: '内容哈希' },
]

export default function HomePage() {
  const {
    syncTask,
    leftSourceType,
    rightSourceType,
    leftPath,
    rightPath,
    leftSSHConfigId,
    rightSSHConfigId,
    strategies,
    extensionFilter,
    error,
    loading,
    setLeftSourceType,
    setRightSourceType,
    setLeftPath,
    setRightPath,
    setLeftSSHConfigId,
    setRightSSHConfigId,
    setStrategies,
    setExtensionFilter,
  } = useCompareStore(useShallow((s) => ({
    syncTask: s.syncTask,
    leftSourceType: s.leftSourceType,
    rightSourceType: s.rightSourceType,
    leftPath: s.leftPath,
    rightPath: s.rightPath,
    leftSSHConfigId: s.leftSSHConfigId,
    rightSSHConfigId: s.rightSSHConfigId,
    strategies: s.strategies,
    extensionFilter: s.extensionFilter,
    error: s.error,
    loading: s.scanning || s.comparing,
    setLeftSourceType: s.setLeftSourceType,
    setRightSourceType: s.setRightSourceType,
    setLeftPath: s.setLeftPath,
    setRightPath: s.setRightPath,
    setLeftSSHConfigId: s.setLeftSSHConfigId,
    setRightSSHConfigId: s.setRightSSHConfigId,
    setStrategies: s.setStrategies,
    setExtensionFilter: s.setExtensionFilter,
  })))
  const { runCompare, rerunActiveSessionIfRunning } = useCompareActions()
  const { setPage, compareTabs, activeCompareTabId } = useAppStore(useShallow((s) => ({
    setPage: s.setPage,
    compareTabs: s.compareTabs,
    activeCompareTabId: s.activeCompareTabId,
  })))
  const globalPathFilters = useSettingsStore((s) => s.globalPathFilters)

  const handleCompare = () => {
    void runCompare()
  }

  const handleSessionFilterChange = async (patterns: readonly string[]) => {
    setExtensionFilter(patterns)
    await rerunActiveSessionIfRunning()
  }

  const handleOpenCompareTab = (compareTabId: string) => {
    openCompareTab(compareTabId, { expandLogs: true })
  }

  const toggleStrategy = (name: StrategyName) => {
    const current = [...strategies]
    const idx = current.indexOf(name)
    if (idx >= 0) {
      current.splice(idx, 1)
    } else {
      current.push(name)
    }
    setStrategies(current)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-700 bg-neutral-800 px-3 py-2">
        <CompareSessionTabs
          compareTabs={compareTabs}
          activeCompareTabId={activeCompareTabId}
          newCompareActive
          onSelectNewCompare={() => setPage('home')}
          onSelectCompareTab={handleOpenCompareTab}
        />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 pt-8">
          <h2 className="text-lg font-semibold">目录对比</h2>

          <div className="flex flex-col gap-4">
            <SourceSelector
              label="左侧"
              sourceType={leftSourceType}
              path={leftPath}
              sshConfigId={leftSSHConfigId}
              onSourceTypeChange={setLeftSourceType}
              onPathChange={setLeftPath}
              onSSHConfigIdChange={setLeftSSHConfigId}
            />
            <SourceSelector
              label="右侧"
              sourceType={rightSourceType}
              path={rightPath}
              sshConfigId={rightSSHConfigId}
              onSourceTypeChange={setRightSourceType}
              onPathChange={setRightPath}
              onSSHConfigIdChange={setRightSSHConfigId}
            />
          </div>

          <div className="flex items-end gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-neutral-400">对比策略</span>
              <div className="flex gap-3">
                {STRATEGY_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={strategies.includes(opt.value)}
                      onChange={() => toggleStrategy(opt.value)}
                      className="accent-blue-500"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <FilterModal
              extensionFilter={extensionFilter}
              onChange={handleSessionFilterChange}
            />
            <span className="text-xs text-neutral-500">
              当前会话 {extensionFilter.length} 条，全局 {globalPathFilters.length} 条
            </span>
          </div>

          <button
            onClick={handleCompare}
            disabled={loading || !leftPath || !rightPath || strategies.length === 0}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {compareTabs.length > 0 ? '开始新的对比' : '开始对比'}
          </button>

          {compareTabs.length > 0 && (
            <div className="rounded border border-neutral-700 bg-neutral-800/70 px-4 py-3 text-sm text-neutral-300">
              已保留 {compareTabs.length} 个对比标签，点击上方标签可继续查看对应结果。
            </div>
          )}

          {syncTask && (
            <div className="flex items-start justify-between gap-4 rounded border border-neutral-700 bg-neutral-800/70 px-4 py-3 text-sm">
              <div className="min-w-0 flex flex-1 flex-col gap-1">
                <span className="text-neutral-200">
                  有一个同步任务{syncTask.status === 'running' ? '正在执行' : syncTask.status === 'completed' ? '已完成' : syncTask.status === 'failed' ? '已失败' : '待继续'}
                </span>
                <div className="flex min-w-0 items-center gap-2 text-xs text-neutral-500">
                  <span className="shrink-0">
                    {syncTask.completedItems}/{syncTask.totalItems} · {formatSyncProgress(syncTask.completedItems, syncTask.totalItems)}
                  </span>
                  {syncTask.currentPath && (
                    <span className="min-w-0 truncate" title={syncTask.currentPath}>
                      · {syncTask.currentPath}
                    </span>
                  )}
                </div>
                {syncTask.lastError && (
                  <span className="truncate text-xs text-red-400" title={syncTask.lastError}>
                    {syncTask.lastError}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  if (!openSyncTaskView({ expandLogs: true })) {
                    setPage('compare')
                  }
                }}
                className="shrink-0 whitespace-nowrap rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                查看同步
              </button>
            </div>
          )}

          {error && (
            <div className="rounded border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
