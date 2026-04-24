import type { CompareEntry, CompareFilter } from '../../../shared/types'
import StatusBadge from './StatusBadge'
import { matchesCompareFilter } from '../utils/tree-utils'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatDate(ms: number): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

interface CompareTableProps {
  readonly entries: readonly CompareEntry[]
  readonly filter: CompareFilter
  readonly onFilterChange: (filter: CompareFilter) => void
}

const FILTERS: { value: CompareFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'paired', label: '双方' },
  { value: 'different', label: '不同' },
  { value: 'left_only', label: '仅左' },
  { value: 'right_only', label: '仅右' },
  { value: 'equal', label: '相同' },
]

export default function CompareTable({ entries, filter, onFilterChange }: CompareTableProps) {
  const filtered = entries.filter((entry) => matchesCompareFilter(filter, entry))

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.value
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-auto rounded border border-neutral-700">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-700 bg-neutral-800 text-xs text-neutral-400">
            <tr>
              <th className="px-3 py-2">路径</th>
              <th className="w-16 px-3 py-2">状态</th>
              <th className="w-24 px-3 py-2 text-right">左侧大小</th>
              <th className="w-24 px-3 py-2 text-right">右侧大小</th>
              <th className="w-40 px-3 py-2 text-right">左侧修改时间</th>
              <th className="w-40 px-3 py-2 text-right">右侧修改时间</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-neutral-500">
                  无匹配项
                </td>
              </tr>
            )}
            {filtered.map((entry) => (
              <tr
                key={entry.relativePath}
                className="border-b border-neutral-800 hover:bg-neutral-800/50"
              >
                <td className="px-3 py-1.5 font-mono text-xs">
                  {entry.isDirectory ? '📁 ' : '📄 '}
                  {entry.relativePath}
                </td>
                <td className="px-3 py-1.5">
                  <StatusBadge state={entry.state} />
                </td>
                <td className="px-3 py-1.5 text-right text-xs text-neutral-400">
                  {entry.left ? formatSize(entry.left.size) : '—'}
                </td>
                <td className="px-3 py-1.5 text-right text-xs text-neutral-400">
                  {entry.right ? formatSize(entry.right.size) : '—'}
                </td>
                <td className="px-3 py-1.5 text-right text-xs text-neutral-400">
                  {entry.left ? formatDate(entry.left.mtime) : '—'}
                </td>
                <td className="px-3 py-1.5 text-right text-xs text-neutral-400">
                  {entry.right ? formatDate(entry.right.mtime) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
