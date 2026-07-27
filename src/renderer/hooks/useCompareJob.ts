import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { CompareStats } from '../../../shared/types'
import { useCompareStore } from '../stores/compare-store'
import { resetDiffTabsForRerun } from '../utils/command-actions'
import { useCompareActions } from './useCompare'

export interface CompareJobState {
  readonly loading: boolean
  readonly paused: boolean
  readonly done: boolean
  readonly error: string | null
  readonly duration: number
  /** `扫描中… / 对比中… / 扫描并对比中…`，空闲时为 `null`。 */
  readonly statusLabel: string | null
  readonly stats: CompareStats
  readonly pendingCount: number
  readonly dirtyCount: number
  /** 这个标签是否已经有过一次结果——决定按钮是「首次对比」还是「重启对比」。 */
  readonly hasComparedResult: boolean
  readonly noStrategies: boolean
  readonly restart: () => Promise<void>
  readonly resume: () => Promise<void>
  readonly pause: () => Promise<void>
  readonly recompareDirty: () => Promise<void>
}

/**
 * 目录对比这个长作业的状态与四个动作（DESIGN-SYSTEM §7 的
 * `idle → running → done | error | cancelled`）。
 *
 * 工具栏的按钮、进度线、`⌘R` / `⌘.` 与溢出菜单里的「重比变更」读的是同一份，
 * 所以三处不可能各自漂移——旧代码里这套判断在 `CompareTree` 和 `CompareToolbar`
 * 之间靠 12 个 prop 来回传。
 */
export function useCompareJob(): CompareJobState {
  const { pauseCompare, resumeCompare, restartCompare, recompareDirtyPaths } = useCompareActions()

  const { scanning, comparing, paused, done, error, duration, entrySummary, entryCount, dirtyCount, strategyCount } =
    useCompareStore(useShallow((state) => ({
      scanning: state.scanning,
      comparing: state.comparing,
      paused: state.paused,
      done: state.done,
      error: state.error,
      duration: state.duration,
      entrySummary: state.entrySummary,
      entryCount: state.entries.length,
      dirtyCount: state.dirtyPaths.size,
      strategyCount: state.strategies.length,
    })))

  // 结果标签在重跑时会被清空又填回，所以每次重跑前先收掉打开的文件差异标签
  // （`resetDiffTabsForRerun`），否则它们会指向一份已经不存在的对比。
  // 那个函数是模块级的，命令面板和全局快捷键调的是同一个（chunk 9）。
  const restart = useCallback(async () => {
    resetDiffTabsForRerun()
    await restartCompare()
  }, [restartCompare])

  const resume = useCallback(async () => {
    resetDiffTabsForRerun()
    await resumeCompare()
  }, [resumeCompare])

  const pause = useCallback(async () => {
    await pauseCompare()
  }, [pauseCompare])

  const recompareDirty = useCallback(async () => {
    resetDiffTabsForRerun()
    await recompareDirtyPaths()
  }, [recompareDirtyPaths])

  const { stats, pendingCount } = entrySummary

  return {
    loading: scanning || comparing,
    paused,
    done,
    error,
    duration,
    statusLabel: scanning && comparing
      ? '扫描并对比中…'
      : scanning
        ? '扫描中…'
        : comparing
          ? '对比中…'
          : null,
    stats,
    pendingCount,
    dirtyCount,
    hasComparedResult: done || pendingCount > 0 || entryCount > 0,
    noStrategies: strategyCount === 0,
    restart,
    resume,
    pause,
    recompareDirty,
  }
}
