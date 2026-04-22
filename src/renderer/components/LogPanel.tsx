import { useEffect, useMemo, useRef, useState } from 'react'
import { useLogStore } from '../stores/log-store'
import { useAppStore } from '../stores/app-store'
import type { LogLevel, LogScope } from '../../../shared/types'

type LogScopeFilter = 'current' | 'all' | LogScope

function formatTs(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

const LEVEL_STYLE: Record<LogLevel, string> = {
  info: 'text-neutral-300',
  warn: 'text-yellow-400',
  error: 'text-red-400',
}

const SCOPE_STYLE: Record<LogScope, string> = {
  app: 'bg-neutral-700 text-neutral-200',
  compare: 'bg-blue-900/60 text-blue-300',
  sync: 'bg-emerald-900/60 text-emerald-300',
  ssh: 'bg-purple-900/60 text-purple-300',
}

const FILTER_OPTIONS: ReadonlyArray<{ value: LogScopeFilter; label: string }> = [
  { value: 'current', label: '当前' },
  { value: 'all', label: '全部' },
  { value: 'compare', label: '对比' },
  { value: 'sync', label: '同步' },
  { value: 'ssh', label: 'SSH' },
  { value: 'app', label: '系统' },
]

function resolveCurrentScope(page: ReturnType<typeof useAppStore.getState>['page']): LogScope {
  if (page === 'compare') return 'compare'
  if (page === 'ssh') return 'ssh'
  return 'app'
}

export default function LogPanel() {
  const logs = useLogStore((s) => s.logs)
  const visible = useLogStore((s) => s.visible)
  const toggleVisible = useLogStore((s) => s.toggleVisible)
  const clear = useLogStore((s) => s.clear)
  const page = useAppStore((s) => s.page)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeFilter, setActiveFilter] = useState<LogScopeFilter>('current')

  const currentScope = resolveCurrentScope(page)
  const filteredLogs = useMemo(() => {
    if (activeFilter === 'all') return logs
    const scope = activeFilter === 'current' ? currentScope : activeFilter
    return logs.filter((entry) => entry.scope === scope)
  }, [activeFilter, currentScope, logs])

  // Listen for log events from main process
  useEffect(() => {
    const unsub = window.api.onLog((entry) => {
      useLogStore.getState().addLog(entry)
    })
    return unsub
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [filteredLogs])

  return (
    <div className="flex shrink-0 flex-col border-t border-neutral-700 bg-neutral-900">
      {/* Title bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-850 px-3 py-1.5">
        <button
          onClick={toggleVisible}
          className="text-xs text-neutral-400 hover:text-neutral-200"
        >
          {visible ? '▼' : '▶'}
        </button>
        <span className="text-xs font-medium text-neutral-400">日志</span>
        <span className="text-xs text-neutral-600">{filteredLogs.length}/{logs.length}</span>
        <div className="flex flex-wrap gap-1">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setActiveFilter(option.value)}
              className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                activeFilter === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <button
            onClick={clear}
            className="text-xs text-neutral-500 hover:text-neutral-300"
          >
            清除
          </button>
        </div>
      </div>

      {/* Log content */}
      {visible && (
        <div ref={scrollRef} className="h-36 overflow-auto font-mono text-xs leading-5">
          {filteredLogs.length === 0 && (
            <div className="px-3 py-2 text-neutral-600">暂无日志</div>
          )}
          {filteredLogs.map((log, i) => (
            <div key={`${log.timestamp}-${log.scope}-${i}`} className={`flex gap-2 px-3 hover:bg-neutral-800/50 ${LEVEL_STYLE[log.level]}`}>
              <span className="shrink-0 text-neutral-600">{formatTs(log.timestamp)}</span>
              <span className="shrink-0 w-10 text-right uppercase opacity-60">{log.level}</span>
              <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${SCOPE_STYLE[log.scope]}`}>
                {log.scope}
              </span>
              <span className="break-all">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
