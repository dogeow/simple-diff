import { useState, useEffect, useMemo } from 'react'
import type { CompareHistoryEntry, SSHConfig, SourceConfig } from '../../../shared/types'
import { useCompareStore } from '../stores/compare-store'
import { useAppStore } from '../stores/app-store'
import { truncatePath } from '../utils/tree-utils'
import { PlayIcon, TrashIcon } from '../components/Icons'

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
  const setLeftSourceType = useCompareStore((s) => s.setLeftSourceType)
  const setLeftPath = useCompareStore((s) => s.setLeftPath)
  const setLeftSSHConfigId = useCompareStore((s) => s.setLeftSSHConfigId)
  const setRightSourceType = useCompareStore((s) => s.setRightSourceType)
  const setRightPath = useCompareStore((s) => s.setRightPath)
  const setRightSSHConfigId = useCompareStore((s) => s.setRightSSHConfigId)

  const sshLabelsById = useMemo(
    () => new Map(sshConfigs.map((config) => [config.id, config.label])),
    [sshConfigs],
  )
  const sshHostsById = useMemo(
    () => new Map(sshConfigs.map((config) => [config.id, config.host])),
    [sshConfigs],
  )
  const pairOptions = useMemo(() => {
    const optionMap = new Map<
      string,
      { value: string; label: string; leftLabel: string; rightLabel: string; count: number }
    >()

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

      optionMap.set(value, { value, label, leftLabel, rightLabel, count: 1 })
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
      setLeftSourceType('local')
      setLeftPath(left.path)
    } else {
      setLeftSourceType('sftp')
      setLeftSSHConfigId(left.configId)
      setLeftPath(left.path)
    }

    if (right.type === 'local') {
      setRightSourceType('local')
      setRightPath(right.path)
    } else {
      setRightSourceType('sftp')
      setRightSSHConfigId(right.configId)
      setRightPath(right.path)
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
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-6 pt-6 pb-8">
        <header className="flex items-end justify-between gap-4 border-b border-neutral-800 pb-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-100">对比历史</h2>
            <p className="text-xs text-neutral-500">
              {loading
                ? '正在加载...'
                : entries.length === 0
                  ? '尚未生成任何对比记录'
                  : `共 ${entries.length} 条记录${pairFilter !== 'all' ? ` · 当前显示 ${filteredEntries.length} 条` : ''}`}
            </p>
          </div>
          {entries.length > 0 && (
            <button
              onClick={handleClear}
              className="group inline-flex shrink-0 items-center gap-1.5 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:border-red-700 hover:bg-red-900/40 hover:text-red-200"
            >
              <TrashIcon width={12} height={12} />
              清空历史
            </button>
          )}
        </header>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-neutral-500" />
            加载中...
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 py-16 text-center">
            <span className="text-3xl text-neutral-700">∅</span>
            <p className="text-sm text-neutral-500">暂无对比历史</p>
            <p className="text-xs text-neutral-600">完成一次对比后，结果将自动归档至此</p>
          </div>
        )}

        {!loading && entries.length > 0 && (
          <div
            role="group"
            aria-label="对比组合"
            className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-400">对比组合</span>
              {pairFilter !== 'all' && (
                <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                  当前 {filteredEntries.length} 条
                </span>
              )}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
              <AllChip
                active={pairFilter === 'all'}
                onClick={() => setPairFilter('all')}
                count={entries.length}
              />
              {pairOptions.map((option) => (
                <PairChip
                  key={option.value}
                  active={pairFilter === option.value}
                  onClick={() => setPairFilter(option.value)}
                  leftLabel={option.leftLabel}
                  rightLabel={option.rightLabel}
                  fullLabel={option.label}
                  count={option.count}
                />
              ))}
            </div>
          </div>
        )}

        {!loading && entries.length > 0 && filteredEntries.length === 0 && (
          <div className="py-12 text-center text-sm text-neutral-500">当前筛选下暂无对比历史</div>
        )}

        <div role="list" aria-label="对比历史列表" className="flex flex-col gap-2.5">
          {filteredEntries.map((entry) => {
            const leftLabel = formatHistorySourceLabel(entry.leftSource, entry.leftLabel, sshLabelsById)
            const rightLabel = formatHistorySourceLabel(entry.rightSource, entry.rightLabel, sshLabelsById)

            return (
              <div
                key={entry.id}
                role="listitem"
                className="group flex items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3.5 transition-colors hover:border-neutral-700 hover:bg-neutral-900/70"
              >
                <div className="flex-1 overflow-hidden">
                  <div
                    className="truncate text-sm font-medium text-neutral-100"
                    title={`${leftLabel} ↔ ${rightLabel}`}
                  >
                    <span>{truncatePath(leftLabel)}</span>
                    <span className="mx-2 text-neutral-600">↔</span>
                    <span>{truncatePath(rightLabel)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1 text-neutral-500">
                      <span className="h-1 w-1 rounded-full bg-neutral-600" />
                      {formatTime(entry.timestamp)}
                    </span>
                    <StatPill color="emerald" label="相同" value={entry.stats.equal} />
                    <StatPill color="amber" label="不同" value={entry.stats.different} />
                    <StatPill color="sky" label="仅左" value={entry.stats.leftOnly} />
                    <StatPill color="violet" label="仅右" value={entry.stats.rightOnly} />
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5 opacity-90 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => handleRerun(entry)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-500"
                  >
                    <PlayIcon width={11} height={11} />
                    重新对比
                  </button>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    aria-label={`删除 ${leftLabel} ↔ ${rightLabel}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800/60 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-700/70 hover:text-neutral-100"
                  >
                    <TrashIcon width={11} height={11} />
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

const PILL_STYLES = {
  emerald: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',
  amber: 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  sky: 'bg-sky-500/10 text-sky-300 ring-sky-500/20',
  violet: 'bg-violet-500/10 text-violet-300 ring-violet-500/20',
} as const

const DOT_STYLES = {
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  sky: 'bg-sky-400',
  violet: 'bg-violet-400',
} as const

function StatPill({
  color,
  label,
  value,
}: {
  color: keyof typeof PILL_STYLES
  label: string
  value: number
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${PILL_STYLES[color]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_STYLES[color]}`} />
      {label}
      <span className="tabular-nums">{value}</span>
    </span>
  )
}

function splitLabel(label: string): { host: string | null; path: string } {
  const colonIdx = label.indexOf(':/')
  if (colonIdx > 0) {
    return { host: label.slice(0, colonIdx), path: label.slice(colonIdx + 1) }
  }
  return { host: null, path: label }
}

const CHIP_BASE =
  'group/chip relative flex w-full items-stretch gap-2 rounded-lg border p-2 text-left transition-colors'
const CHIP_ACTIVE =
  'border-blue-500/60 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]'
const CHIP_IDLE =
  'border-neutral-700 bg-neutral-800/50 hover:border-neutral-600 hover:bg-neutral-800'

function AllChip({
  active,
  onClick,
  count,
}: {
  active: boolean
  onClick: () => void
  count: number
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`${CHIP_BASE} ${active ? CHIP_ACTIVE : CHIP_IDLE} items-center`}
    >
      <div className="flex flex-1 items-center gap-2">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-md text-sm ${
            active ? 'bg-blue-500/20 text-blue-200' : 'bg-neutral-700/60 text-neutral-400'
          }`}
        >
          ∀
        </span>
        <span className={`text-sm font-medium ${active ? 'text-blue-100' : 'text-neutral-200'}`}>
          全部历史
        </span>
      </div>
      <CountBadge active={active} count={count} />
    </button>
  )
}

function PairChip({
  active,
  onClick,
  leftLabel,
  rightLabel,
  fullLabel,
  count,
}: {
  active: boolean
  onClick: () => void
  leftLabel: string
  rightLabel: string
  fullLabel: string
  count: number
}) {
  const left = splitLabel(leftLabel)
  const right = splitLabel(rightLabel)

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={fullLabel}
      aria-label={fullLabel}
      className={`${CHIP_BASE} ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <PathRow side="L" host={left.host} path={left.path} active={active} />
        <PathRow side="R" host={right.host} path={right.path} active={active} />
      </div>
      <div className="flex shrink-0 items-center">
        <CountBadge active={active} count={count} />
      </div>
    </button>
  )
}

function PathRow({
  side,
  host,
  path,
  active,
}: {
  side: 'L' | 'R'
  host: string | null
  path: string
  active: boolean
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs">
      <span
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold ${
          active
            ? side === 'L'
              ? 'bg-sky-500/25 text-sky-200'
              : 'bg-violet-500/25 text-violet-200'
            : side === 'L'
              ? 'bg-sky-500/15 text-sky-300/80'
              : 'bg-violet-500/15 text-violet-300/80'
        }`}
      >
        {side}
      </span>
      {host && (
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
            active ? 'bg-neutral-700/70 text-neutral-200' : 'bg-neutral-800 text-neutral-400'
          }`}
        >
          {host}
        </span>
      )}
      <span
        dir="rtl"
        className={`min-w-0 flex-1 truncate text-left font-mono text-[11px] ${
          active ? 'text-neutral-100' : 'text-neutral-300'
        }`}
      >
        &lrm;{path}
      </span>
    </div>
  )
}

function CountBadge({ active, count }: { active: boolean; count: number }) {
  return (
    <span
      className={`ml-1 inline-flex min-w-[24px] items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
        active ? 'bg-blue-500/25 text-blue-100' : 'bg-neutral-700/80 text-neutral-400'
      }`}
    >
      {count}
    </span>
  )
}
