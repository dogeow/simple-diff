import { useEffect, useRef } from 'react'
import { useLogStore } from '../stores/log-store'
import type { LogLevel } from '../../../shared/types'

function formatTs(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

const LEVEL_STYLE: Record<LogLevel, string> = {
  info: 'text-neutral-300',
  warn: 'text-yellow-400',
  error: 'text-red-400',
}

export default function LogPanel() {
  const logs = useLogStore((s) => s.logs)
  const visible = useLogStore((s) => s.visible)
  const toggleVisible = useLogStore((s) => s.toggleVisible)
  const clear = useLogStore((s) => s.clear)
  const scrollRef = useRef<HTMLDivElement>(null)

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
  }, [logs])

  return (
    <div className="flex shrink-0 flex-col border-t border-neutral-700 bg-neutral-900">
      {/* Title bar */}
      <div className="flex h-7 items-center gap-2 border-b border-neutral-800 bg-neutral-850 px-3">
        <button
          onClick={toggleVisible}
          className="text-xs text-neutral-400 hover:text-neutral-200"
        >
          {visible ? '▼' : '▶'}
        </button>
        <span className="text-xs font-medium text-neutral-400">日志</span>
        <span className="text-xs text-neutral-600">{logs.length}</span>
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
          {logs.length === 0 && (
            <div className="px-3 py-2 text-neutral-600">暂无日志</div>
          )}
          {logs.map((log, i) => (
            <div key={i} className={`flex gap-2 px-3 hover:bg-neutral-800/50 ${LEVEL_STYLE[log.level]}`}>
              <span className="shrink-0 text-neutral-600">{formatTs(log.timestamp)}</span>
              <span className="shrink-0 w-10 text-right uppercase opacity-60">{log.level}</span>
              <span className="break-all">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
