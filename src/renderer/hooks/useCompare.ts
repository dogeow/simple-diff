import { useCallback } from 'react'
import { mergePathFilters } from '@shared/path-filter'
import {
  applyCompareErrorToSnapshot,
  applyFinishCompareToSnapshot,
  applyPauseCompareToSnapshot,
  applyPausedCompareErrorToSnapshot,
  hasCompareSessionContent,
  type CompareSessionSnapshot,
  useCompareStore,
} from '../stores/compare-store'
import { useAppStore, type CompareTab } from '../stores/app-store'
import { useSettingsStore } from '../stores/settings-store'
import type { CompareCacheEntry, CompareEntry, SourceConfig } from '../../../shared/types'
import { addRendererLog } from '../stores/log-store'
import { flushBufferedCompareEvents } from '../utils/compare-events'

function buildSourceConfig(type: 'local' | 'sftp', path: string, sshConfigId: string): SourceConfig {
  if (type === 'sftp') {
    return { type: 'sftp', configId: sshConfigId, path }
  }
  return { type: 'local', path }
}

function createCompareId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${Date.now()}-${crypto.randomUUID()}`
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createCompareSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

function createCompareCacheEntries(entries: readonly CompareEntry[]): readonly CompareCacheEntry[] {
  const cacheEntries: CompareCacheEntry[] = []

  for (const entry of entries) {
    if (entry.isDirectory) continue
    if (!entry.left || !entry.right) continue
    if (entry.state !== 'equal' && entry.state !== 'different') continue

    cacheEntries.push({
      relativePath: entry.relativePath,
      state: entry.state,
      left: {
        isDirectory: entry.left.isDirectory,
        size: entry.left.size,
        mtime: entry.left.mtime,
      },
      right: {
        isDirectory: entry.right.isDirectory,
        size: entry.right.size,
        mtime: entry.right.mtime,
      },
      reasons: entry.reasons,
    })
  }

  return cacheEntries
}

function formatCompareTabTitle(leftPath: string, rightPath: string): string {
  const getLabel = (path: string) => {
    const normalized = path.replace(/[\\/]+$/g, '')
    const segments = normalized.split(/[\\/]/).filter(Boolean)
    return segments.at(-1) ?? normalized ?? ''
  }

  return `${getLabel(leftPath) || leftPath || '左侧'} ↔ ${getLabel(rightPath) || rightPath || '右侧'}`
}

interface RunCompareOptions {
  readonly reuseActiveSession?: boolean
  readonly navigateToCompare?: boolean
  readonly preserveEntries?: boolean
}

const pauseRequestedCompareIds = new Set<string>()

export function resolveReusableCompareId(
  currentSnapshot: CompareSessionSnapshot,
  activeCompareTab?: CompareTab,
): string | null {
  if (currentSnapshot.activeCompareId && (currentSnapshot.scanning || currentSnapshot.comparing)) {
    return currentSnapshot.activeCompareId
  }

  const activeTabSnapshot = activeCompareTab?.snapshot
  if (activeTabSnapshot?.activeCompareId && (activeTabSnapshot.scanning || activeTabSnapshot.comparing)) {
    return activeTabSnapshot.activeCompareId
  }

  return null
}

export function createRunningCompareTabSnapshot(snapshot: CompareSessionSnapshot): CompareSessionSnapshot {
  if (!snapshot.activeCompareId || (!snapshot.scanning && !snapshot.comparing)) {
    return snapshot
  }

  return {
    ...snapshot,
    entries: [],
    loadingDirs: [],
  }
}

function syncCurrentCompareTabSnapshot(compareTabId: string): void {
  const appStore = useAppStore.getState()
  const compareTab = appStore.compareTabs.find((tab) => tab.id === compareTabId)
  if (!compareTab) {
    return
  }

  appStore.saveCompareTab({
    id: compareTabId,
    title: compareTab.title,
    snapshot: useCompareStore.getState().createSnapshot(),
    diffTabs: appStore.diffTabs,
    activeDiffTabId: appStore.activeDiffTabId,
  })
}

export function useCompareActions() {
  const runCompare = useCallback(async (options?: RunCompareOptions) => {
    const compareState = useCompareStore.getState()
    const {
      leftPath: currentLeftPath,
      rightPath: currentRightPath,
      strategies: currentStrategies,
      extensionFilter: currentExtensionFilter,
      leftSourceType: currentLeftSourceType,
      rightSourceType: currentRightSourceType,
      leftSSHConfigId: currentLeftSSHConfigId,
      rightSSHConfigId: currentRightSSHConfigId,
    } = compareState

    if (!currentLeftPath || !currentRightPath) {
      compareState.setError('请选择左右两侧目录')
      return
    }

    const appStore = useAppStore.getState()
    const currentSnapshot = compareState.createSnapshot()
    const activeCompareTabId = appStore.activeCompareTabId
    const currentCompareTab = activeCompareTabId
      ? appStore.compareTabs.find((tab) => tab.id === activeCompareTabId)
      : undefined
    const reuseActiveSession = options?.reuseActiveSession === true && activeCompareTabId !== null
    const preserveEntries = options?.preserveEntries ?? reuseActiveSession
    const compareIdToCancel = reuseActiveSession
      ? resolveReusableCompareId(currentSnapshot, currentCompareTab)
      : null
    const globalPathFilters = useSettingsStore.getState().globalPathFilters
    const effectivePathFilters = mergePathFilters(globalPathFilters, currentExtensionFilter)
    const previousEntries = createCompareCacheEntries(currentSnapshot.entries)

    if (!reuseActiveSession && activeCompareTabId && hasCompareSessionContent(currentSnapshot)) {
      appStore.saveCompareTab({
        id: activeCompareTabId,
        title: currentCompareTab?.title ?? formatCompareTabTitle(currentSnapshot.leftPath, currentSnapshot.rightPath),
        snapshot: currentSnapshot,
        diffTabs: appStore.diffTabs,
        activeDiffTabId: appStore.activeDiffTabId,
      })
    }

    const compareId = createCompareId()
    const compareTabId = reuseActiveSession ? activeCompareTabId : createCompareSessionId()

    const left = buildSourceConfig(currentLeftSourceType, currentLeftPath, currentLeftSSHConfigId)
    const right = buildSourceConfig(currentRightSourceType, currentRightPath, currentRightSSHConfigId)

    if (compareIdToCancel) {
      addRendererLog('compare', 'info', `准备取消旧对比 compareId=${compareIdToCancel}`)
      await window.api.cancelCompare(compareIdToCancel)
    }

    appStore.replaceDiffTabs([], null)
    appStore.setActiveCompareTab(compareTabId)

    // Start scanning — navigate immediately
    compareState.startScanning(compareId, { preserveEntries })
    compareState.setSources(left, right)

    addRendererLog(
      'compare',
      'info',
      `发起对比 compareId=${compareId} tabId=${compareTabId} left=${left.type}:${left.path} right=${right.type}:${right.path} strategies=${currentStrategies.join(',')}`,
    )

    appStore.saveCompareTab({
      id: compareTabId,
      title: formatCompareTabTitle(left.path, right.path),
      snapshot: createRunningCompareTabSnapshot(useCompareStore.getState().createSnapshot()),
      diffTabs: [],
      activeDiffTabId: null,
    })

    if (options?.navigateToCompare !== false) {
      useAppStore.getState().setPage('compare')
    }

    try {
      addRendererLog('compare', 'info', `调用主进程 compare:run compareId=${compareId}`)
      const response = await window.api.runCompare({
        compareId,
        left,
        right,
        strategies: [...currentStrategies],
        extensionFilter: effectivePathFilters.length > 0 ? effectivePathFilters : undefined,
        previousEntries: previousEntries.length > 0 ? previousEntries : undefined,
      })

      if (response.success && response.data) {
        pauseRequestedCompareIds.delete(compareId)
        addRendererLog(
          'compare',
          'info',
          `compare:run 返回成功 compareId=${compareId} total=${response.data.stats.total} duration=${response.data.duration}ms`,
        )
        flushBufferedCompareEvents(compareId)
        if (useCompareStore.getState().activeCompareId === compareId) {
          useCompareStore.getState().finishCompare(compareId, response.data)
          syncCurrentCompareTabSnapshot(compareTabId)
        } else {
          addRendererLog(
            'compare',
            'info',
            `compare:run 成功结果未写入当前活动 store，activeCompareId=${useCompareStore.getState().activeCompareId ?? '-'} compareId=${compareId}`,
          )
          useAppStore.getState().updateCompareTabSnapshot(compareTabId, (snapshot) =>
            applyFinishCompareToSnapshot(snapshot, compareId, response.data!),
          )
        }
      } else if (response.error === '对比已取消') {
        const pauseRequested = pauseRequestedCompareIds.delete(compareId)
        addRendererLog('compare', 'warn', `compare:run 被取消 compareId=${compareId}`)
        flushBufferedCompareEvents(compareId)
        if (useCompareStore.getState().activeCompareId === compareId) {
          if (pauseRequested) {
            useCompareStore.getState().pauseCompare(compareId)
          } else {
            useCompareStore.getState().setError(null, compareId)
          }
          syncCurrentCompareTabSnapshot(compareTabId)
        } else {
          addRendererLog(
            'compare',
            'info',
            `compare:run 取消结果未写入当前活动 store，activeCompareId=${useCompareStore.getState().activeCompareId ?? '-'} compareId=${compareId}`,
          )
          useAppStore.getState().updateCompareTabSnapshot(compareTabId, (snapshot) =>
            pauseRequested
              ? applyPauseCompareToSnapshot(snapshot, compareId)
              : applyCompareErrorToSnapshot(snapshot, compareId, null),
          )
        }
      } else {
        const pauseRequested = pauseRequestedCompareIds.delete(compareId)
        const message = response.error ?? '对比失败'
        addRendererLog('compare', 'error', `compare:run 返回失败 compareId=${compareId} error=${message}`)
        flushBufferedCompareEvents(compareId)
        if (useCompareStore.getState().activeCompareId === compareId) {
          useCompareStore.getState().setError(message, compareId)
          syncCurrentCompareTabSnapshot(compareTabId)
        } else if (
          pauseRequested
          && useAppStore.getState().activeCompareTabId === compareTabId
          && useCompareStore.getState().paused
          && useCompareStore.getState().activeCompareId === compareId
        ) {
          useCompareStore.getState().setError(message)
          syncCurrentCompareTabSnapshot(compareTabId)
        } else {
          addRendererLog(
            'compare',
            'info',
            `compare:run 失败结果未写入当前活动 store，activeCompareId=${useCompareStore.getState().activeCompareId ?? '-'} compareId=${compareId}`,
          )
          useAppStore.getState().updateCompareTabSnapshot(compareTabId, (snapshot) =>
            pauseRequested
              ? applyPausedCompareErrorToSnapshot(snapshot, compareId, message)
              : applyCompareErrorToSnapshot(snapshot, compareId, message),
          )
        }
      }
    } catch (error) {
      const pauseRequested = pauseRequestedCompareIds.delete(compareId)
      const message = error instanceof Error ? error.message : '对比失败'
      addRendererLog('compare', 'error', `compare:run 抛异常 compareId=${compareId} error=${message}`)
      flushBufferedCompareEvents(compareId)
      if (useCompareStore.getState().activeCompareId === compareId) {
        useCompareStore.getState().setError(message, compareId)
        syncCurrentCompareTabSnapshot(compareTabId)
      } else if (
        pauseRequested
        && useAppStore.getState().activeCompareTabId === compareTabId
        && useCompareStore.getState().paused
        && useCompareStore.getState().activeCompareId === compareId
      ) {
        useCompareStore.getState().setError(message)
        syncCurrentCompareTabSnapshot(compareTabId)
      } else {
        addRendererLog(
          'compare',
          'info',
          `compare:run 异常结果未写入当前活动 store，activeCompareId=${useCompareStore.getState().activeCompareId ?? '-'} compareId=${compareId}`,
        )
        useAppStore.getState().updateCompareTabSnapshot(compareTabId, (snapshot) =>
          pauseRequested
            ? applyPausedCompareErrorToSnapshot(snapshot, compareId, message)
            : applyCompareErrorToSnapshot(snapshot, compareId, message),
        )
      }
    }
  }, [])

  const rerunActiveSessionIfRunning = useCallback(async () => {
    const appStore = useAppStore.getState()
    const activeCompareTab = appStore.activeCompareTabId
      ? appStore.compareTabs.find((tab) => tab.id === appStore.activeCompareTabId)
      : undefined

    if (!activeCompareTab) {
      return false
    }

    const currentSnapshot = useCompareStore.getState().createSnapshot()
    if (!resolveReusableCompareId(currentSnapshot, activeCompareTab)) {
      return false
    }

    await runCompare({ reuseActiveSession: true, navigateToCompare: false })
    return true
  }, [runCompare])

  const pauseCompare = useCallback(async () => {
    const compareState = useCompareStore.getState()
    const appStore = useAppStore.getState()
    const activeCompareTab = appStore.activeCompareTabId
      ? appStore.compareTabs.find((tab) => tab.id === appStore.activeCompareTabId)
      : undefined
    const compareId = resolveReusableCompareId(compareState.createSnapshot(), activeCompareTab)

    if (!compareId) {
      return false
    }

    pauseRequestedCompareIds.add(compareId)
    addRendererLog('compare', 'info', `准备暂停对比 compareId=${compareId}`)
    const response = await window.api.cancelCompare(compareId)
    if (!response.success && response.error !== '对比已取消') {
      pauseRequestedCompareIds.delete(compareId)
      addRendererLog('compare', 'error', `暂停对比失败 compareId=${compareId} error=${response.error ?? '未知错误'}`)
      return false
    }

    useCompareStore.getState().pauseCompare(compareId)
    useAppStore.getState().updateCompareTabSnapshotByCompareId(compareId, (snapshot) =>
      applyPauseCompareToSnapshot(snapshot, compareId),
    )
    return true
  }, [])

  const resumeCompare = useCallback(async () => {
    const hasActiveCompareTab = useAppStore.getState().activeCompareTabId !== null
    await runCompare({
      reuseActiveSession: hasActiveCompareTab,
      navigateToCompare: false,
      preserveEntries: true,
    })
  }, [runCompare])

  const restartCompare = useCallback(async () => {
    const hasActiveCompareTab = useAppStore.getState().activeCompareTabId !== null
    await runCompare({
      reuseActiveSession: hasActiveCompareTab,
      navigateToCompare: false,
      preserveEntries: false,
    })
  }, [runCompare])

  return {
    runCompare,
    rerunActiveSessionIfRunning,
    pauseCompare,
    resumeCompare,
    restartCompare,
  }
}
