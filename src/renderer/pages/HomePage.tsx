import { useEffect } from 'react'
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
import { ArrowRightIcon, PlayIcon, SwapIcon } from '../components/Icons'

const STRATEGY_OPTIONS: { value: StrategyName; label: string; hint: string }[] = [
  { value: 'size', label: '文件大小', hint: '快速但仅判断大小' },
  { value: 'mtime', label: '修改时间', hint: '比对最后修改时间' },
  { value: 'quick_hash', label: '快速内容签名', hint: '抽样 hash，权衡速度与准确性' },
  { value: 'hash', label: '内容哈希', hint: '完整 SHA，最准确但最慢' },
]

const SYNC_STATUS_TONE: Record<string, string> = {
  running: 'text-blue-300',
  completed: 'text-emerald-300',
  failed: 'text-rose-300',
  paused: 'text-amber-300',
}

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

  const ctaDisabled = loading || !leftPath || !rightPath || strategies.length === 0
  const ctaLabel = compareTabs.length > 0 ? '开始新的对比' : '开始对比'
  const showWelcome = !leftPath && !rightPath && compareTabs.length === 0

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        if (!ctaDisabled) {
          event.preventDefault()
          handleCompare()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [ctaDisabled])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-800 bg-neutral-850 px-3 py-2">
        <CompareSessionTabs
          compareTabs={compareTabs}
          activeCompareTabId={activeCompareTabId}
          newCompareActive
          onSelectNewCompare={() => setPage('home')}
          onSelectCompareTab={handleOpenCompareTab}
        />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 pt-8 pb-10">
          <header className="flex flex-col gap-1.5">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-100">目录对比</h2>
            <p className="text-xs text-neutral-500">
              选择左右两侧目录后开始对比；支持本地与 SFTP 远程，可拖拽文件夹至输入框。
            </p>
          </header>

          {showWelcome && (
            <div className="rounded-lg border border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/20 text-blue-300">
                  <PlayIcon width={11} height={11} />
                </span>
                <span className="text-sm font-medium text-neutral-100">三步开始你的第一次对比</span>
              </div>
              <ol className="ml-1 grid gap-1.5 text-xs text-neutral-400 sm:grid-cols-3">
                <li className="flex items-start gap-2">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[10px] font-semibold text-neutral-300">1</span>
                  <span>选择左右数据源（本地或 SFTP）</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[10px] font-semibold text-neutral-300">2</span>
                  <span>勾选至少一种对比策略</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[10px] font-semibold text-neutral-300">3</span>
                  <span>按 <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1 py-0 font-mono text-[10px] text-neutral-300">⌘ Enter</kbd> 触发</span>
                </li>
              </ol>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                <span>提示：</span>
                <span className="rounded bg-neutral-800/70 px-1.5 py-0.5">⌘K 命令面板</span>
                <span className="rounded bg-neutral-800/70 px-1.5 py-0.5">? 快捷键帮助</span>
                <span className="rounded bg-neutral-800/70 px-1.5 py-0.5">右键文件可忽略 / 同步</span>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-400">数据源</span>
              <span className="text-[11px] text-neutral-600">本地 ↔ 本地、本地 ↔ SFTP、SFTP ↔ SFTP</span>
              <button
                onClick={() => {
                  const tmpType = leftSourceType
                  const tmpPath = leftPath
                  const tmpSSH = leftSSHConfigId
                  setLeftSourceType(rightSourceType)
                  setLeftPath(rightPath)
                  setLeftSSHConfigId(rightSSHConfigId)
                  setRightSourceType(tmpType)
                  setRightPath(tmpPath)
                  setRightSSHConfigId(tmpSSH)
                }}
                disabled={!leftPath && !rightPath}
                title="交换左右数据源"
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800/60 px-2 py-1 text-[11px] text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <SwapIcon width={11} height={11} />
                交换左右
              </button>
            </div>
            <div className="flex flex-col gap-3">
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
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-neutral-400">对比策略</span>
              {strategies.length === 0 && (
                <span className="text-[11px] text-amber-300">至少选择一个策略</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {STRATEGY_OPTIONS.map((opt) => {
                const active = strategies.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleStrategy(opt.value)}
                    title={opt.hint}
                    className={`group inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'border-blue-500/60 bg-blue-500/15 text-blue-100 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]'
                        : 'border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full transition-colors ${
                        active ? 'bg-blue-300' : 'bg-neutral-600 group-hover:bg-neutral-500'
                      }`}
                    />
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <FilterModal
              extensionFilter={extensionFilter}
              onChange={handleSessionFilterChange}
            />
            <span className="text-xs text-neutral-500">
              当前会话 <span className="tabular-nums text-neutral-300">{extensionFilter.length}</span> 条 ·
              全局 <span className="tabular-nums text-neutral-300">{globalPathFilters.length}</span> 条
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCompare}
              disabled={ctaDisabled}
              className="group inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-500 hover:shadow-md disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400 disabled:shadow-none"
            >
              <PlayIcon width={14} height={14} />
              {ctaLabel}
            </button>
            <span className="text-[11px] text-neutral-500">
              <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">⌘ Enter</kbd>
              <span className="ml-1">快速触发</span>
            </span>
          </div>

          {compareTabs.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-300">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-blue-300">
                {compareTabs.length}
              </span>
              <span className="text-xs text-neutral-400">
                已保留 {compareTabs.length} 个对比标签，点击上方标签可继续查看对应结果。
              </span>
            </div>
          )}

          {syncTask && (
            <div className="flex items-start gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-sm">
              <div className="min-w-0 flex flex-1 flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-200">同步任务</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SYNC_STATUS_TONE[syncTask.status] ?? 'text-neutral-400'} bg-neutral-800/70`}>
                    {syncTask.status === 'running' ? '正在执行' : syncTask.status === 'completed' ? '已完成' : syncTask.status === 'failed' ? '已失败' : '待继续'}
                  </span>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
                  <span className="shrink-0 tabular-nums">
                    {syncTask.completedItems}/{syncTask.totalItems} · {formatSyncProgress(syncTask.completedItems, syncTask.totalItems)}
                  </span>
                  {syncTask.currentPath && (
                    <span className="min-w-0 truncate" title={syncTask.currentPath}>
                      · {syncTask.currentPath}
                    </span>
                  )}
                </div>
                {syncTask.lastError && (
                  <span className="truncate text-xs text-rose-300" title={syncTask.lastError}>
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
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-500"
              >
                查看同步
                <ArrowRightIcon width={12} height={12} />
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
