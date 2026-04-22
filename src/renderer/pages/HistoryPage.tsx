import { useState, useEffect, useMemo } from 'react'
import type { CompareHistoryEntry, SSHConfig, SourceConfig } from '../../../shared/types'
import { useCompareStore } from '../stores/compare-store'
import { useAppStore } from '../stores/app-store'
import { truncatePath } from '../utils/tree-utils'

function extractSavedSftpLabel(savedLabel: string, configId: string): string | null {
  if (!savedLabel.startsWith('sftp://')) return null

  const body = savedLabel.slice('sftp://'.length)
  const separatorIndex = body.indexOf(':')
  if (separatorIndex < 0) return null

  const candidate = body.slice(0, separatorIndex).trim()
  if (!candidate || candidate === configId) {
    return null
  }

  return candidate
}

function formatHistorySourceLabel(
  source: SourceConfig,
  savedLabel: string,
  sshLabelsById: ReadonlyMap<string, string>,
): string {
  if (source.type === 'local') {
    return source.path
  }

  const resolvedLabel = sshLabelsById.get(source.configId)
    ?? extractSavedSftpLabel(savedLabel, source.configId)
    ?? 'SFTP'

  return `${resolvedLabel}:${source.path}`
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<readonly CompareHistoryEntry[]>([])
  const [sshConfigs, setSSHConfigs] = useState<readonly SSHConfig[]>([])
  const [loading, setLoading] = useState(true)
  const setPage = useAppStore((s) => s.setPage)
  const store = useCompareStore()

  const sshLabelsById = useMemo(
    () => new Map(sshConfigs.map((config) => [config.id, config.label])),
    [sshConfigs],
  )

  const load = async () => {
    setLoading(true)
    const [historyResult, sshConfigsResult] = await Promise.all([
      window.api.listHistory(),
      window.api.listSSHConfigs(),
    ])

    if (historyResult.success && historyResult.data) {
      setEntries(historyResult.data)
    }

    if (sshConfigsResult.success && sshConfigsResult.data) {
      setSSHConfigs(sshConfigsResult.data)
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleClear = async () => {
    await window.api.clearHistory()
    setEntries([])
  }

  const handleDelete = async (id: string) => {
    await window.api.deleteHistory(id)
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  const handleRerun = (entry: CompareHistoryEntry) => {
    // Populate the compare store and switch to home to start comparison
    const left = entry.leftSource
    const right = entry.rightSource

    if (left.type === 'local') {
      store.setLeftSourceType('local')
      store.setLeftPath(left.path)
    } else {
      store.setLeftSourceType('sftp')
      store.setLeftSSHConfigId(left.configId)
      store.setLeftPath(left.path)
    }

    if (right.type === 'local') {
      store.setRightSourceType('local')
      store.setRightPath(right.path)
    } else {
      store.setRightSourceType('sftp')
      store.setRightSSHConfigId(right.configId)
      store.setRightPath(right.path)
    }

    setPage('home')
  }

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-4 pb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">对比历史</h2>
          {entries.length > 0 && (
            <button
              onClick={handleClear}
              className="rounded bg-red-900/50 px-3 py-1 text-xs text-red-400 hover:bg-red-900/80"
            >
              清空历史
            </button>
          )}
        </div>

        {loading && <div className="text-sm text-neutral-400">加载中...</div>}

        {!loading && entries.length === 0 && (
          <div className="py-12 text-center text-neutral-500">暂无对比历史</div>
        )}

        <div className="flex flex-col gap-2">
          {entries.map((entry) => {
            const leftLabel = formatHistorySourceLabel(entry.leftSource, entry.leftLabel, sshLabelsById)
            const rightLabel = formatHistorySourceLabel(entry.rightSource, entry.rightLabel, sshLabelsById)

            return (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded border border-neutral-700 bg-neutral-800/50 px-4 py-3"
              >
                <div className="flex-1 overflow-hidden">
                  <div className="text-sm font-medium truncate" title={`${leftLabel} ↔ ${rightLabel}`}>
                    {truncatePath(leftLabel)} ↔ {truncatePath(rightLabel)}
                  </div>
                  <div className="mt-0.5 flex gap-3 text-xs text-neutral-400">
                    <span>{formatTime(entry.timestamp)}</span>
                    <span className="text-green-400">同 {entry.stats.equal}</span>
                    <span className="text-yellow-400">异 {entry.stats.different}</span>
                    <span className="text-blue-400">左 {entry.stats.leftOnly}</span>
                    <span className="text-purple-400">右 {entry.stats.rightOnly}</span>
                  </div>
                </div>
                <div className="ml-3 flex gap-2">
                  <button
                    onClick={() => handleRerun(entry)}
                    className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-500"
                  >
                    重新对比
                  </button>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="rounded bg-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-600"
                  >
                    删除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
