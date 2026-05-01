import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCompareStore } from '../stores/compare-store'
import { useSSHStore } from '../stores/ssh-store'
import { formatSyncProgress } from '../utils/format-sync-progress'
import { formatComparePairLabel } from '../utils/source-label'
import { openCompareTab } from '../utils/compare-session-navigation'
import { PauseIcon, PlayIcon, RefreshIcon, TrashIcon } from '../components/Icons'

const STATUS_CLASS: Record<string, string> = {
  running: 'bg-blue-500/15 text-blue-200 ring-blue-500/30',
  paused: 'bg-amber-500/15 text-amber-200 ring-amber-500/30',
  completed: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/30',
  failed: 'bg-rose-500/15 text-rose-200 ring-rose-500/30',
}

const ITEM_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-neutral-800 text-neutral-300',
  running: 'bg-blue-500/15 text-blue-300',
  completed: 'bg-emerald-500/15 text-emerald-300',
}

export default function SyncPage() {
  const { syncTask, setSyncTask } = useCompareStore(useShallow((state) => ({
    syncTask: state.syncTask,
    setSyncTask: state.setSyncTask,
  })))
  const { configs, loadConfigs } = useSSHStore(useShallow((state) => ({
    configs: state.configs,
    loadConfigs: state.loadConfigs,
  })))

  useEffect(() => {
    if (!syncTask) {
      return
    }

    if (syncTask.leftSource.type === 'sftp' || syncTask.rightSource.type === 'sftp') {
      void loadConfigs()
    }
  }, [configs.length, loadConfigs, syncTask])

  const handlePause = async () => {
    const response = await window.api.pauseSync()
    if (response.success) {
      setSyncTask(response.data ?? null)
    }
  }

  const handleResume = async () => {
    const response = await window.api.resumeSync()
    if (response.success) {
      setSyncTask(response.data ?? null)
    }
  }

  const handleClear = async () => {
    const response = await window.api.clearSync()
    if (response.success) {
      setSyncTask(null)
    }
  }

  if (!syncTask) {
    return (
      <div className="h-full overflow-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-5 px-6 pt-6 pb-8">
          <header className="flex items-end justify-between gap-4 border-b border-neutral-800 pb-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold tracking-tight text-neutral-100">同步任务</h2>
              <p className="text-xs text-neutral-500">当前没有进行中的同步任务</p>
            </div>
          </header>

          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 py-16 text-center">
            <span className="text-3xl text-neutral-700">∅</span>
            <p className="text-sm text-neutral-500">暂无同步任务</p>
            <p className="text-xs text-neutral-600">从目录对比里执行复制或同步后，这里会显示完整文件列表</p>
          </div>
        </div>
      </div>
    )
  }

  const pairLabel = formatComparePairLabel(syncTask.leftSource, syncTask.rightSource, configs)
  const items = syncTask.items ?? []
  const runningItems = items.filter((item) => item.status === 'running')
  const pendingItems = items.filter((item) => item.status === 'pending')
  const completedItems = items.filter((item) => item.status === 'completed')
  const queueGroups = [
    { key: 'running', title: '正在执行', count: runningItems.length, items: runningItems },
    { key: 'pending', title: '等待队列', count: pendingItems.length, items: pendingItems },
    { key: 'completed', title: '已完成', count: completedItems.length, items: completedItems },
  ]

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-6 pt-6 pb-8">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-800 pb-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-100">同步队列</h2>
            <p className="text-xs text-neutral-500">
              {pairLabel ?? '未识别同步来源'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => openCompareTab(undefined, { expandLogs: true })}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800/70 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
            >
              <RefreshIcon width={12} height={12} />
              查看对应对比
            </button>
            {syncTask.status === 'running' && (
              <button
                onClick={handlePause}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800/70 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
              >
                <PauseIcon width={12} height={12} />
                暂停
              </button>
            )}
            {(syncTask.status === 'paused' || syncTask.status === 'failed') && (
              <button
                onClick={handleResume}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
              >
                <PlayIcon width={12} height={12} />
                继续
              </button>
            )}
            {syncTask.status !== 'running' && (
              <button
                onClick={handleClear}
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-900/50 bg-rose-950/30 px-3 py-1.5 text-xs font-medium text-rose-200 transition-colors hover:border-rose-700 hover:bg-rose-900/40"
              >
                <TrashIcon width={12} height={12} />
                清除
              </button>
            )}
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-300">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_CLASS[syncTask.status] ?? 'bg-neutral-800 text-neutral-300 ring-neutral-700'}`}>
                {syncTask.status === 'running'
                  ? '进行中'
                  : syncTask.status === 'paused'
                    ? '已暂停'
                    : syncTask.status === 'completed'
                      ? '已完成'
                      : '失败'}
              </span>
              <span className="tabular-nums text-neutral-400">
                {syncTask.completedItems}/{syncTask.totalItems} · {formatSyncProgress(syncTask.completedItems, syncTask.totalItems)}
              </span>
            </div>

            {syncTask.currentPath && (
              <div className="mt-3 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2 font-mono text-xs text-neutral-300">
                当前: {syncTask.currentPath}
              </div>
            )}

            {syncTask.lastCompletedPath && (
              <div className="mt-2 text-xs text-neutral-500">
                最近完成: <span className="font-mono text-neutral-400">{syncTask.lastCompletedPath}</span>
              </div>
            )}

            {syncTask.lastError && (
              <div className="mt-3 rounded-md border border-rose-900/60 bg-rose-950/30 px-3 py-2 text-sm text-rose-300">
                {syncTask.lastError}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-300">
            <div className="text-sm font-medium text-neutral-100">任务概览</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2">
                <div className="text-neutral-500">方向</div>
                <div className="mt-1 font-medium text-neutral-200">{syncTask.direction === 'left_to_right' ? '左 -> 右' : '右 -> 左'}</div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2">
                <div className="text-neutral-500">文件数</div>
                <div className="mt-1 font-medium text-neutral-200">{items.length || syncTask.totalItems}</div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2">
                <div className="text-neutral-500">创建时间</div>
                <div className="mt-1 font-medium text-neutral-200">{new Date(syncTask.createdAt).toLocaleString('zh-CN')}</div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2">
                <div className="text-neutral-500">更新时间</div>
                <div className="mt-1 font-medium text-neutral-200">{new Date(syncTask.updatedAt).toLocaleString('zh-CN')}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900/40">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-neutral-100">任务列表 / 队列</div>
              <div className="mt-1 text-xs text-neutral-500">按执行状态查看本次同步里的目录与文件</div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-neutral-500">
              <span>进行中 {runningItems.length}</span>
              <span>待执行 {pendingItems.length}</span>
              <span>已完成 {completedItems.length}</span>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-auto divide-y divide-neutral-800">
            {items.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-neutral-500">
                当前任务尚未生成可展示的文件列表
              </div>
            )}

            {items.length > 0 && queueGroups.map((group) => (
              <div key={group.key} className="px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-xs font-medium text-neutral-300">{group.title}</div>
                  <div className="text-xs tabular-nums text-neutral-600">{group.count}</div>
                </div>

                {group.items.length === 0 ? (
                  <div className="rounded-md border border-dashed border-neutral-800 px-3 py-3 text-xs text-neutral-600">
                    暂无{group.title}项目
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-md border border-neutral-800">
                    {group.items.map((item) => (
                      <div key={`${group.key}:${item.kind}:${item.relativePath}`} className="grid grid-cols-[96px_72px_minmax(0,1fr)] items-center gap-3 border-b border-neutral-800/70 px-3 py-2 last:border-b-0">
                        <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${ITEM_STATUS_CLASS[item.status] ?? 'bg-neutral-800 text-neutral-300'}`}>
                          {item.status === 'completed' ? '已完成' : item.status === 'running' ? '进行中' : '待执行'}
                        </span>
                        <span className="text-xs text-neutral-400">{item.kind === 'directory' ? '目录' : '文件'}</span>
                        <span className="min-w-0 truncate font-mono text-xs text-neutral-200">{item.relativePath}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}