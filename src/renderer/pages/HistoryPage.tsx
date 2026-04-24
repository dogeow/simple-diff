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

function buildHistorySourceFilterKey(
  source: SourceConfig,
  sshHostsById: ReadonlyMap<string, string>,
): string {
  if (source.type === 'local') {
    return `local:${source.path}`
  }

  return `sftp:${sshHostsById.get(source.configId) ?? source.configId}:${source.path}`
}

function buildHistoryPairFilterKey(
  entry: CompareHistoryEntry,
  sshHostsById: ReadonlyMap<string, string>,
): string {
  return `${buildHistorySourceFilterKey(entry.leftSource, sshHostsById)}↔${buildHistorySourceFilterKey(entry.rightSource, sshHostsById)}`
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<readonly CompareHistoryEntry[]>([])
  const [sshConfigs, setSSHConfigs] = useState<readonly SSHConfig[]>([])
  const [pairFilter, setPairFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const setPage = useAppStore((s) => s.setPage)
  const store = useCompareStore()

  const sshLabelsById = useMemo(
    () => new Map(sshConfigs.map((config) => [config.id, config.label])),
    [sshConfigs],
  )
  const sshHostsById = useMemo(
    () => new Map(sshConfigs.map((config) => [config.id, config.host])),
    [sshConfigs],
  )
  const pairOptions = useMemo(() => {
    const optionMap = new Map<string, { value: string; label: string; count: number }>()

    for (const entry of entries) {
      const value = buildHistoryPairFilterKey(entry, sshHostsById)
      const leftLabel = formatHistorySourceLabel(entry.leftSource, entry.leftLabel, sshLabelsById)
      const rightLabel = formatHistorySourceLabel(entry.rightSource, entry.rightLabel, sshLabelsById)
      const label = `${leftLabel} ↔ ${rightLabel}`
      const existing = optionMap.get(value)

      if (existing) {
        optionMap.set(value, { ...existing, count: existing.count + 1 })
        continue
      }

      optionMap.set(value, { value, label, count: 1 })
    }

    return [...optionMap.values()]
  }, [entries, sshHostsById, sshLabelsById])
  const filteredEntries = useMemo(() => {
    if (pairFilter === 'all') return entries
    return entries.filter((entry) => buildHistoryPairFilterKey(entry, sshHostsById) === pairFilter)
  }, [entries, pairFilter, sshHostsById])

  useEffect(() => {
    if (pairFilter === 'all') return
    if (pairOptions.some((option) => option.value === pairFilter)) return
    setPairFilter('all')
  }, [pairFilter, pairOptions])

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

        {!loading && entries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="history-pair-filter" className="text-xs text-neutral-400">
              对比组合
            </label>
            <select
              id="history-pair-filter"
              value={pairFilter}
              onChange={(event) => setPairFilter(event.target.value)}
              className="min-w-0 max-w-full rounded border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500"
            >
              <option value="all">全部历史</option>
              {pairOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {`${option.label} (${option.count})`}
                </option>
              ))}
            </select>
            {pairFilter !== 'all' && (
              <span className="text-xs text-neutral-500">当前 {filteredEntries.length} 条</span>
            )}
          </div>
        )}

        {!loading && entries.length > 0 && filteredEntries.length === 0 && (
          <div className="py-12 text-center text-neutral-500">当前筛选下暂无对比历史</div>
        )}

        <div className="flex flex-col gap-2">
          {filteredEntries.map((entry) => {
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
                    <span className="text-green-400">相同 {entry.stats.equal}</span>
                    <span className="text-yellow-400">不同 {entry.stats.different}</span>
                    <span className="text-blue-400">仅左 {entry.stats.leftOnly}</span>
                    <span className="text-purple-400">仅右 {entry.stats.rightOnly}</span>
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
