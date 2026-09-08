import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { SyncDirection, SyncTaskSnapshot } from '../../../shared/types'
import { useCompareStore } from '../stores/compare-store'
import { getRuntimeInfo } from '../runtime/runtime-info'
import { shouldShowSyncTaskInCompare } from '../utils/sync-task-visibility'
import {
  clearCompareSync,
  pauseCompareSync,
  resumeCompareSync,
  startCompareSync,
} from '../utils/command-actions'
import { canQueueSyncDirection } from './useSelectionSync'

export interface CompareSyncState {
  readonly supportsSync: boolean
  /** 只有当队列里那个任务的数据源和当前标签一致时才是「本视图的作业」（F7）。 */
  readonly visibleSyncTask: SyncTaskSnapshot | null
  readonly canStartSync: boolean
  readonly canQueue: (direction: SyncDirection) => boolean
  readonly start: (direction: SyncDirection) => Promise<void>
  readonly pause: () => Promise<void>
  readonly resume: () => Promise<void>
  readonly clear: () => Promise<void>
}

/**
 * 同步任务的一份状态与动作。
 *
 * 蓝图 §1.2.5 / F7：同一个任务此前有四个界面（`SyncPage`、工具栏行内条、Home 卡片、
 * 全局指示器）。现在只剩三层——工具栏的 2px 进度线（仅本标签）、常驻状态栏、
 * 以及队列抽屉，而三者都从这里取数。
 *
 * 四个动作本身住在 `utils/command-actions.ts`：命令面板的「同步到右 / 暂停同步 /
 * 清除同步」和这里的同步菜单必须是同一个实现，否则两处的前置判断迟早会分叉。
 */
export function useCompareSync(): CompareSyncState {
  const supportsSync = getRuntimeInfo().supportsSync

  const { entrySummary, done, scanning, comparing, leftSource, rightSource, syncTask, compareSessionId } =
    useCompareStore(useShallow((state) => ({
      entrySummary: state.entrySummary,
      compareSessionId: state.compareSessionId,
      done: state.done,
      scanning: state.scanning,
      comparing: state.comparing,
      leftSource: state.leftSource,
      rightSource: state.rightSource,
      syncTask: state.syncTask,
    })))

  const visibleSyncTask = useMemo(
    () => (supportsSync && shouldShowSyncTaskInCompare(syncTask, leftSource, rightSource) ? syncTask : null),
    [leftSource, rightSource, supportsSync, syncTask],
  )

  const { stats, pendingCount } = entrySummary
  const canStartSync = Boolean(compareSessionId) && done && !scanning && !comparing && pendingCount === 0 && stats.total > 0

  // 队列是全局单例：判断能否入队要看真实的 `syncTask`，而不是本标签可见的那份。
  const canQueue = useCallback(
    (direction: SyncDirection) => canQueueSyncDirection(syncTask, leftSource, rightSource, direction),
    [leftSource, rightSource, syncTask],
  )

  const start = useCallback((direction: SyncDirection) => startCompareSync(direction), [])

  return {
    supportsSync,
    visibleSyncTask,
    canStartSync,
    canQueue,
    start,
    pause: pauseCompareSync,
    resume: resumeCompareSync,
    clear: clearCompareSync,
  }
}
