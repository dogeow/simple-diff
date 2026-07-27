import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLogStore } from '../stores/log-store'
import type { LogLevel, LogScope } from '../../../shared/types'
import { ChevronDown, Trash2 } from 'lucide-react'
import { Button, IconButton, ToggleGroup, type ToggleGroupOption } from './ui'

type LogScopeFilter = 'all' | LogScope

function formatTs(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

const LEVEL_STYLE: Record<LogLevel, string> = {
  info: 'text-fg',
  warn: 'text-warning-text',
  error: 'text-danger-text',
}

const LEVEL_DOT: Record<LogLevel, string> = {
  info: 'bg-idle',
  warn: 'bg-warning',
  error: 'bg-danger',
}

const SCOPE_STYLE: Record<LogScope, string> = {
  app: 'bg-surface-2 text-fg ring-border-strong',
  compare: 'bg-accent-quiet text-accent-text ring-accent/40',
  'compare-watch': 'bg-running-quiet text-running-text ring-running/30',
  sync: 'bg-chart-2/15 text-chart-2 ring-chart-2/30',
  ssh: 'bg-surface-2 text-fg-muted ring-border',
}

const FILTER_OPTIONS: ReadonlyArray<ToggleGroupOption<LogScopeFilter>> = [
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

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [filteredLogs])

  // F9：收起时不占任何 chrome。折叠态只剩状态栏上的一个计数 chip（`Statusbar.tsx`），
  // 展开靠 `⌘J`、该 chip 或应用菜单。原来的常驻标题栏（含 5 个过滤按钮、计数徽标和
  // 清除按钮）即使日志为空也占着一行。
  if (!visible) {
    return null
  }

  return (
    <div className="relative flex shrink-0 flex-col border-t border-border bg-canvas">
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="拖动调整日志面板高度"
        onMouseDown={handleResizeStart}
        className={`absolute -top-1 left-0 right-0 z-resizer h-2 cursor-row-resize transition-colors ${
          resizing ? 'bg-accent' : 'hover:bg-hover'
        }`}
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-2 py-1">
        <IconButton icon={ChevronDown} label="收起日志" size="xs" variant="ghost" onClick={toggleVisible} />
        <span className="text-xs font-medium text-fg">日志</span>
        <span className="text-2xs tabular-nums text-fg-muted">
          {filteredLogs.length}/{logs.length}
        </span>
        <ToggleGroup
          aria-label="日志范围"
          variant="chips"
          size="xs"
          value={activeFilter}
          onValueChange={setActiveFilter}
          options={[...FILTER_OPTIONS]}
        />
        <Button size="xs" variant="ghost" icon={Trash2} onClick={clear} className="ml-auto">
          清除
        </Button>
      </div>

      <div
        ref={scrollRef}
        style={{ height: `${height}px` }}
        className="overflow-auto bg-inset font-mono text-xs leading-5"
      >
        {filteredLogs.length === 0 && (
          <div className="px-3 py-3 text-fg-subtle">暂无日志</div>
        )}
        {filteredLogs.map((log, i) => (
          <div key={`${log.timestamp}-${log.scope}-${i}`} className={`flex items-start gap-2 px-3 py-0.5 hover:bg-hover ${LEVEL_STYLE[log.level]}`}>
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_DOT[log.level]}`} />
            <span className="shrink-0 text-fg-subtle">{formatTs(log.timestamp)}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-medium uppercase ring-1 ring-inset ${SCOPE_STYLE[log.scope]}`}>
              {log.scope}
            </span>
            <span className="break-all">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
