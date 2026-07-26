import { useCallback } from 'react'
import { mergePathFilters } from '@shared/path-filter'
import {
  applyCompareErrorToSnapshot,
  applyFinishCompareToSnapshot,
  applyPauseCompareToSnapshot,
  applyPausedCompareErrorToSnapshot,
  createLightweightCompareSessionSnapshot,
  hasCompareSessionContent,
  type CompareSessionSnapshot,
  useCompareStore,
} from '../stores/compare-store'
import { useAppStore, type CompareTab } from '../stores/app-store'
import { useSettingsStore } from '../stores/settings-store'
import { useSSHStore } from '../stores/ssh-store'
import type { CompareCacheEntry, CompareEntry, SourceConfig } from '../../../shared/types'
import { addRendererLog } from '../stores/log-store'
import { flushBufferedCompareEvents } from '../utils/compare-events'
import { formatCompareTabTitleFromSources } from '../utils/source-label'
import { minimizeSyncRecompareRoots } from '../utils/sync-dirty'
import { normalizeRelativePath } from '@shared/source-path'

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

function normalizeDirtyPath(relativePath: string): string {
  const trimmed = relativePath.trim()
  if (!trimmed || trimmed === '.' || trimmed === '/') {
    return ''
  }

  return normalizeRelativePath(trimmed, '/')
}

function getDirtyRecompareRoots(dirtyPaths: ReadonlySet<string>): readonly string[] {
  if (dirtyPaths.size === 0) {
    return []
  }

  const roots = new Set<string>()

  for (const dirtyPath of dirtyPaths) {
    let normalizedPath: string
    try {
      normalizedPath = normalizeDirtyPath(dirtyPath)
    } catch {
      continue
    }
    if (!normalizedPath) {
      return ['']
    }

    const lastSlashIndex = normalizedPath.lastIndexOf('/')
    roots.add(lastSlashIndex >= 0 ? normalizedPath.slice(0, lastSlashIndex) : '')
  }

  if (roots.has('')) {
    return ['']
  }

  const sortedRoots = Array.from(roots).sort((a, b) => a.length - b.length || a.localeCompare(b))
  const minimizedRoots: string[] = []

  for (const root of sortedRoots) {
    if (minimizedRoots.some((candidate) => root === candidate || root.startsWith(`${candidate}/`))) {
      continue
    }

    minimizedRoots.push(root)
  }

  return minimizedRoots
}

function formatCompareTabTitle(leftSource: SourceConfig, rightSource: SourceConfig): string {
  return formatCompareTabTitleFromSources(leftSource, rightSource, useSSHStore.getState().configs)
}

function createControlSnapshot() {
  return useCompareStore.getState().createLightweightSnapshot()
}

export function formatCompareErrorForUi(rawError: string): string {
  const message = rawError.trim()
  if (!message) {
    return '对比失败'
  }

  const isMissingPathError = /ENOENT|no such file or directory/i.test(message)
  const isListDirError = /无法列出目录|scandir/i.test(message)
  if (!isMissingPathError || !isListDirError) {
    return message
  }

  const side = /\[(left|right)\]/i.exec(message)?.[1]?.toLowerCase()
  const sideLabel = side === 'left' ? '左侧' : side === 'right' ? '右侧' : '所选'
  const path = /scandir\s+['"]([^'"]+)['"]/i.exec(message)?.[1]
  const target = path ?? '目录'

  return `${sideLabel}目录不可访问：${target}。可能是硬盘未插入、未挂载，或路径已变更。`
}

interface RunCompareOptions {
  readonly reuseActiveSession?: boolean
  readonly navigateToCompare?: boolean
  readonly preserveEntries?: boolean
}

const pauseRequestedCompareIds = new Set<string>()
const syncDirtyRootsByTaskId = new Map<string, readonly string[]>()

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

  return createLightweightCompareSessionSnapshot(snapshot)
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return '-'
  return `${(value / 1024 / 1024).toFixed(1)}MB`
}

function formatRendererMemoryUsage(): string {
  const memory = (performance as Performance & {
    readonly memory?: {
      readonly usedJSHeapSize: number
      readonly totalJSHeapSize: number
      readonly jsHeapSizeLimit: number
    }
  }).memory

  if (!memory) {
    return 'heap=n/a'
  }

  return `heap=${formatBytes(memory.usedJSHeapSize)}/${formatBytes(memory.totalJSHeapSize)} limit=${formatBytes(memory.jsHeapSizeLimit)}`
}

function syncCurrentCompareTabSnapshot(compareTabId: string, options?: { readonly lightweight?: boolean }): void {
  const appStore = useAppStore.getState()
  const compareTab = appStore.compareTabs.find((tab) => tab.id === compareTabId)
  if (!compareTab) {
    return
  }

  const compareState = useCompareStore.getState()
  appStore.saveCompareTab({
    id: compareTabId,
    title: compareTab.title,
    snapshot: options?.lightweight ? compareState.createLightweightSnapshot() : compareState.createTabSnapshot(),
    diffTabs: appStore.diffTabs,
    activeDiffTabId: appStore.activeDiffTabId,
  })
}

export function rememberSyncDirtyRoots(syncTaskId: string | undefined, roots: readonly string[]): void {
  if (!syncTaskId || roots.length === 0) {
    return
  }

  const previousRoots = syncDirtyRootsByTaskId.get(syncTaskId) ?? []
  syncDirtyRootsByTaskId.set(syncTaskId, minimizeSyncRecompareRoots([...previousRoots, ...roots]))
}

export async function refreshSyncedDirtyRoots(syncTaskId: string | undefined): Promise<boolean> {
  if (!syncTaskId) {
    return false
  }

  const roots = syncDirtyRootsByTaskId.get(syncTaskId)
  if (!roots || roots.length === 0) {
    return false
  }

  syncDirtyRootsByTaskId.delete(syncTaskId)
  return runPartialCompareForRoots(roots)
}

async function runPartialCompareForRoots(relativeRoots: readonly string[]): Promise<boolean> {
  const compareState = useCompareStore.getState()
  const activeCompareTabId = useAppStore.getState().activeCompareTabId
  const globalPathFilters = useSettingsStore.getState().globalPathFilters
  const effectiveRelativeRoots = minimizeSyncRecompareRoots(relativeRoots)

  if (!activeCompareTabId || !compareState.leftSource || !compareState.rightSource) {
    return false
  }

  if (effectiveRelativeRoots.length === 0) {
    return false
  }

  const effectivePathFilters = mergePathFilters(globalPathFilters, compareState.extensionFilter)
  const previousEntries = createCompareCacheEntries(compareState.entries)

  addRendererLog('compare', 'info', `开始局部重比对 roots=${effectiveRelativeRoots.join('、') || '.'}`)
  const response = await window.api.runPartialCompare({
    compareId: compareState.compareSessionId ?? undefined,
    left: compareState.leftSource,
    right: compareState.rightSource,
    strategies: [...compareState.strategies],
    extensionFilter: effectivePathFilters.length > 0 ? effectivePathFilters : undefined,
    previousEntries: previousEntries.length > 0 ? previousEntries : undefined,
    relativeRoots: effectiveRelativeRoots,
  })

  if (!response.success || !response.data) {
    const message = formatCompareErrorForUi(response.error ?? '局部重比对失败')
    addRendererLog('compare', 'error', `局部重比对失败 error=${message}`)
    useCompareStore.getState().setError(message)
    return false
  }

  useCompareStore.getState().applyPartialCompareResult(effectiveRelativeRoots, response.data.entries)
  syncCurrentCompareTabSnapshot(activeCompareTabId)
  addRendererLog('compare', 'info', `局部重比对完成 roots=${effectiveRelativeRoots.join('、') || '.'} total=${response.data.stats.total}`)
  return true
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
    const currentSnapshot = compareState.createLightweightSnapshot()
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
    const previousEntries = createCompareCacheEntries(compareState.entries)
    const currentLeftSource = buildSourceConfig(currentLeftSourceType, currentLeftPath, currentLeftSSHConfigId)
    const currentRightSource = buildSourceConfig(currentRightSourceType, currentRightPath, currentRightSSHConfigId)

    if (!reuseActiveSession && activeCompareTabId && hasCompareSessionContent(currentSnapshot)) {
      appStore.saveCompareTab({
        id: activeCompareTabId,
        title: currentCompareTab?.title ?? formatCompareTabTitle(currentLeftSource, currentRightSource),
        snapshot: compareState.createTabSnapshot(),
        diffTabs: appStore.diffTabs,
        activeDiffTabId: appStore.activeDiffTabId,
      })
    }

    const compareId = createCompareId()
    const compareTabId = reuseActiveSession ? activeCompareTabId : createCompareSessionId()

    const left = currentLeftSource
    const right = currentRightSource

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
      title: formatCompareTabTitle(left, right),
      snapshot: createRunningCompareTabSnapshot(useCompareStore.getState().createLightweightSnapshot()),
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
          addRendererLog(
            'compare',
            'info',
            `compare:完成前 entries=${useCompareStore.getState().entries.length} ${formatRendererMemoryUsage()}`,
          )
          useCompareStore.getState().finishCompare(compareId, response.data)
          addRendererLog(
            'compare',
            'info',
            `compare:完成后 entries=${useCompareStore.getState().entries.length} tabSnapshot=lightweight ${formatRendererMemoryUsage()}`,
          )
          syncCurrentCompareTabSnapshot(compareTabId, { lightweight: true })
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
        const message = formatCompareErrorForUi(response.error ?? '对比失败')
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
      const rawMessage = error instanceof Error ? error.message : '对比失败'
      const message = formatCompareErrorForUi(rawMessage)
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

    const currentSnapshot = createControlSnapshot()
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
    const compareId = resolveReusableCompareId(compareState.createLightweightSnapshot(), activeCompareTab)

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

  const recompareDirtyPaths = useCallback(async () => {
    const compareState = useCompareStore.getState()

    const relativeRoots = getDirtyRecompareRoots(compareState.dirtyPaths)
    return runPartialCompareForRoots(relativeRoots)
  }, [])

  return {
    runCompare,
    rerunActiveSessionIfRunning,
    pauseCompare,
    resumeCompare,
    restartCompare,
    recompareDirtyPaths,
  }
}
