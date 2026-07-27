import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { formatDuration } from '@shared/format-duration'
import { ScrollText } from 'lucide-react'
import { Badge, Button, Kbd, Popover, StatusDot } from './ui'
import type { StatusTone } from './ui'
import { useCompareStore } from '../stores/compare-store'
import { useLogStore } from '../stores/log-store'
import { useUIStore } from '../stores/ui-store'
import { useSelectionSync } from '../hooks/useSelectionSync'
import { formatSyncProgress } from '../utils/format-sync-progress'
import { getRuntimeInfo } from '../runtime/runtime-info'
import SyncTaskPopover from './overlays/SyncTaskPopover'

const LOG_ERROR_TAIL = 20

interface JobState {
  readonly tone: StatusTone
  readonly label: string
  readonly detail: string
}

/**
 * DESIGN-SYSTEM §7.2 第三层：全局后台工作的常驻落点。
 * 这里取代了 `GlobalRunningIndicator`（它在 home/compare/sync 上把自己藏起来，
 * 恰好是最需要它的三个页面）。
 */
function useJobState(): JobState | null {
  const { scanning, comparing, paused, done, duration, total, syncTask } = useCompareStore(useShallow((state) => ({
    scanning: state.scanning,
    comparing: state.comparing,
    paused: state.paused,
    done: state.done,
    duration: state.duration,
    total: state.entrySummary.stats.total,
    syncTask: state.syncTask,
  })))

  return useMemo(() => {
    const syncRunning = syncTask?.status === 'running' || syncTask?.status === 'paused'

    if (scanning || comparing) {
      return {
        tone: 'running' as const,
        label: scanning && comparing ? '扫描并对比中' : scanning ? '扫描中' : '对比中',
        detail: total > 0 ? `${total} 项` : '',
      }
    }

    if (paused) {
      return { tone: 'warning' as const, label: '对比已暂停', detail: total > 0 ? `${total} 项` : '' }
    }

    if (syncRunning && syncTask) {
      return {
        tone: syncTask.status === 'running' ? ('running' as const) : ('warning' as const),
        label: syncTask.status === 'running' ? '同步中' : '同步已暂停',
        detail: `${syncTask.completedItems}/${syncTask.totalItems} · ${formatSyncProgress(syncTask.completedItems, syncTask.totalItems)}`,
      }
    }

    if (syncTask?.status === 'failed') {
      return { tone: 'danger' as const, label: '同步失败', detail: syncTask.lastError ?? '' }
    }

    if (done) {
      return { tone: 'success' as const, label: '对比完成', detail: formatDuration(duration) }
    }

    return null
  }, [comparing, done, duration, paused, scanning, syncTask, total])
}

/**
 * 蓝图 §4.5：手动对齐提示落在这个槽里，而不是文本工具栏里的一枚行内胶囊。
 *
 * 提示和作业是并排而不是互相顶替的：正在跑的对比 / 同步是这一层唯一的常驻落点
 * （DESIGN-SYSTEM §7.2），后台跑着对比时切到文本模式做手动对齐，不该让其中任何
 * 一句话消失。文本模式下作业槽多半是空的，此时提示就是任务槽的标签本身。
 */
function JobSlot() {
  const job = useJobState()
  const hint = useUIStore((state) => state.statusHint)

  if (!job && !hint) {
    return <span className="text-fg-subtle">就绪</span>
  }

  return (
    <div className="flex items-center gap-2">
      {job ? (
        <Popover
          aria-label="任务列表"
          trigger={
            <button
              type="button"
              className="inline-flex h-5 items-center gap-1.5 rounded-sm px-1.5 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <StatusDot status={job.tone} />
              <span>{job.label}</span>
              {job.detail ? <span className="font-mono tabular-nums text-fg-subtle">{job.detail}</span> : null}
            </button>
          }
        >
          <SyncTaskPopover />
        </Popover>
      ) : null}
      {hint ? (
        <span
          className={`inline-flex h-5 items-center gap-1.5 px-1.5 text-xs ${
            hint.tone === 'warning' ? 'text-warning-text' : 'text-fg-muted'
          }`}
        >
          <StatusDot status={hint.tone} />
          {hint.label}
        </span>
      ) : null}
    </div>
  )
}

function SelectionSlot() {
  const supportsSync = getRuntimeInfo().supportsSync
  const selectedPaths = useUIStore((state) => state.treeSelection.selectedPaths)
  const clearTreeSelection = useUIStore((state) => state.clearTreeSelection)
  const { canQueue, countFor, copySelection } = useSelectionSync()

  const leftCount = countFor(selectedPaths, 'left_to_right')
  const rightCount = countFor(selectedPaths, 'right_to_left')

  if (selectedPaths.size === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-1.5">
      <span title="按 Shift 连选、按 Cmd/Ctrl 增减选择" className="tabular-nums">
        已选 {selectedPaths.size} 项
      </span>
      {supportsSync ? (
        <>
          <Button
            size="xs"
            variant="ghost"
            disabled={leftCount === 0 || !canQueue('left_to_right')}
            onClick={() => void copySelection(selectedPaths, 'left_to_right')}
          >
            复制所选到右边
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={rightCount === 0 || !canQueue('right_to_left')}
            onClick={() => void copySelection(selectedPaths, 'right_to_left')}
          >
            复制所选到左边
          </Button>
        </>
      ) : null}
      <Button size="xs" variant="ghost" onClick={clearTreeSelection}>清除选择</Button>
    </div>
  )
}

function LogSlot() {
  const logs = useLogStore((state) => state.logs)
  const visible = useLogStore((state) => state.visible)
  const toggleVisible = useLogStore((state) => state.toggleVisible)

  const hasRecentError = useMemo(
    () => logs.slice(-LOG_ERROR_TAIL).some((entry) => entry.level === 'error'),
    [logs],
  )

  return (
    <button
      type="button"
      onClick={toggleVisible}
      aria-pressed={visible}
      title={visible ? '收起日志面板 (⌘J)' : '展开日志面板 (⌘J)'}
      className="inline-flex h-5 items-center gap-1.5 rounded-sm px-1.5 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg"
    >
      <ScrollText aria-hidden size={12} strokeWidth={1.75} />
      日志
      <Badge tone={hasRecentError ? 'danger' : 'neutral'} size="xs" className="tabular-nums">
        {logs.length}
      </Badge>
    </button>
  )
}

/** 常驻 24px 底栏：任务槽 · 选择槽 · 日志槽（DESIGN-SYSTEM §9）。 */
export default function Statusbar() {
  return (
    <footer className="flex h-statusbar shrink-0 items-center gap-3 border-t border-border bg-surface px-2 text-xs text-fg-muted">
      <JobSlot />
      <SelectionSlot />
      <div className="ml-auto flex items-center gap-2">
        <LogSlot />
        <span className="hidden items-center gap-1 sm:inline-flex">
          <Kbd>Mod K</Kbd>
          命令面板
        </span>
      </div>
    </footer>
  )
}
