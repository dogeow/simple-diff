import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLogStore } from '../stores/log-store'
import type { LogLevel, LogScope } from '../../../shared/types'
import { ChevronDownIcon, ChevronRightIcon, TrashIcon } from './Icons'

type LogScopeFilter = 'all' | LogScope

function formatTs(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

const LEVEL_STYLE: Record<LogLevel, string> = {
  info: 'text-neutral-300',
  warn: 'text-amber-300',
  error: 'text-rose-300',
}

const LEVEL_DOT: Record<LogLevel, string> = {
  info: 'bg-neutral-500',
  warn: 'bg-amber-400',
  error: 'bg-rose-400',
}

const SCOPE_STYLE: Record<LogScope, string> = {
  app: 'bg-neutral-800 text-neutral-300 ring-neutral-700',
  compare: 'bg-blue-500/15 text-blue-300 ring-blue-500/30',
  'compare-watch': 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30',
  sync: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  ssh: 'bg-purple-500/15 text-purple-300 ring-purple-500/30',
}

const FILTER_OPTIONS: ReadonlyArray<{ value: LogScopeFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'compare', label: '对比' },
  { value: 'sync', label: '同步' },
  { value: 'ssh', label: 'SSH' },
  { value: 'app', label: '系统' },
]

export default function LogPanel() {
  const logs = useLogStore((s) => s.logs)
  const visible = useLogStore((s) => s.visible)
  const height = useLogStore((s) => s.height)
  const toggleVisible = useLogStore((s) => s.toggleVisible)
  const setHeight = useLogStore((s) => s.setHeight)
  const clear = useLogStore((s) => s.clear)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeFilter, setActiveFilter] = useState<LogScopeFilter>('all')
  const [resizing, setResizing] = useState(false)

  const handleResizeStart = useCallback((startEvent: React.MouseEvent) => {
    startEvent.preventDefault()
    const startY = startEvent.clientY
    const startHeight = height
    setResizing(true)

    const handleMove = (event: MouseEvent) => {
      const delta = startY - event.clientY
      setHeight(startHeight + delta)
    }
    const handleUp = () => {
      setResizing(false)
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [height, setHeight])

  const filteredLogs = useMemo(() => {
    if (activeFilter === 'all') return logs
    return logs.filter((entry) => entry.scope === activeFilter)
  }, [activeFilter, logs])

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
    <div className="relative flex shrink-0 flex-col border-t border-neutral-800 bg-neutral-900">
      {visible && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="拖动调整日志面板高度"
          onMouseDown={handleResizeStart}
          className={`absolute -top-1 left-0 right-0 z-20 h-2 cursor-row-resize transition-colors ${
            resizing ? 'bg-blue-500/60' : 'hover:bg-blue-500/30'
          }`}
        />
      )}
      {/* Title bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-850 px-3 py-1.5">
        <button
          onClick={toggleVisible}
          aria-label={visible ? '收起日志' : '展开日志'}
          className="inline-flex h-5 w-5 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          {visible ? <ChevronDownIcon width={12} height={12} /> : <ChevronRightIcon width={12} height={12} />}
        </button>
        <span className="text-xs font-medium text-neutral-300">日志</span>
        <span className="rounded-full bg-neutral-800/80 px-1.5 py-0.5 text-[10px] tabular-nums text-neutral-500">
          {filteredLogs.length}/{logs.length}
        </span>
        <div className="flex flex-wrap gap-1">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setActiveFilter(option.value)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                activeFilter === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-800/70 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <button
            onClick={clear}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <TrashIcon width={11} height={11} />
            清除
          </button>
        </div>
      </div>

      {/* Log content */}
      {visible && (
        <div
          ref={scrollRef}
          style={{ height: `${height}px` }}
          className="overflow-auto bg-neutral-900 font-mono text-xs leading-5"
        >
          {filteredLogs.length === 0 && (
            <div className="px-3 py-3 text-neutral-600">暂无日志</div>
          )}
          {filteredLogs.map((log, i) => (
            <div key={`${log.timestamp}-${log.scope}-${i}`} className={`flex items-start gap-2 px-3 py-0.5 hover:bg-neutral-800/40 ${LEVEL_STYLE[log.level]}`}>
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_DOT[log.level]}`} />
              <span className="shrink-0 text-neutral-600">{formatTs(log.timestamp)}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ring-1 ring-inset ${SCOPE_STYLE[log.scope]}`}>
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
