import { useCallback } from 'react'
import { mergePathFilters } from '@shared/path-filter'
import {
  applyCompareErrorToSnapshot,
  applyFinishCompareToSnapshot,
  hasCompareSessionContent,
  type CompareSessionSnapshot,
  useCompareStore,
} from '../stores/compare-store'
import { useAppStore, type CompareTab } from '../stores/app-store'
import { useSettingsStore } from '../stores/settings-store'
import type { SourceConfig } from '../../../shared/types'

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
}

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

export function useCompare() {
  const store = useCompareStore()
  const setPage = useAppStore((s) => s.setPage)
  const {
    leftPath, rightPath, strategies, extensionFilter,
    leftSourceType, rightSourceType, leftSSHConfigId, rightSSHConfigId,
    scanning, comparing, done, error, entries,
  } = store

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
      store.setError('请选择左右两侧目录')
      return
    }

    const appStore = useAppStore.getState()
    const currentSnapshot = compareState.createSnapshot()
    const activeCompareTabId = appStore.activeCompareTabId
    const currentCompareTab = activeCompareTabId
      ? appStore.compareTabs.find((tab) => tab.id === activeCompareTabId)
      : undefined
    const reuseActiveSession = options?.reuseActiveSession === true && activeCompareTabId !== null
    const compareIdToCancel = reuseActiveSession
      ? resolveReusableCompareId(currentSnapshot, currentCompareTab)
      : null
    const globalPathFilters = useSettingsStore.getState().globalPathFilters
    const effectivePathFilters = mergePathFilters(globalPathFilters, currentExtensionFilter)

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
      await window.api.cancelCompare(compareIdToCancel)
    }

    appStore.replaceDiffTabs([], null)
    appStore.setActiveCompareTab(compareTabId)

    // Start scanning — navigate immediately
    store.startScanning(compareId, { preserveEntries: reuseActiveSession })
    store.setSources(left, right)

    appStore.saveCompareTab({
      id: compareTabId,
      title: formatCompareTabTitle(left.path, right.path),
      snapshot: useCompareStore.getState().createSnapshot(),
      diffTabs: [],
      activeDiffTabId: null,
    })

    if (options?.navigateToCompare !== false) {
      setPage('compare')
    }

    try {
      const response = await window.api.runCompare({
        compareId,
        left,
        right,
        strategies: [...currentStrategies],
        extensionFilter: effectivePathFilters.length > 0 ? effectivePathFilters : undefined,
      })

      if (response.success && response.data) {
        if (useCompareStore.getState().activeCompareId === compareId) {
          store.finishCompare(compareId, response.data)
        }
        useAppStore.getState().updateCompareTabSnapshot(compareTabId, (snapshot) =>
          applyFinishCompareToSnapshot(snapshot, compareId, response.data!),
        )
      } else if (response.error === '对比已取消') {
        if (useCompareStore.getState().activeCompareId === compareId) {
          store.setError(null, compareId)
        }
        useAppStore.getState().updateCompareTabSnapshot(compareTabId, (snapshot) =>
          applyCompareErrorToSnapshot(snapshot, compareId, null),
        )
      } else {
        const message = response.error ?? '对比失败'
        if (useCompareStore.getState().activeCompareId === compareId) {
          store.setError(message, compareId)
        }
        useAppStore.getState().updateCompareTabSnapshot(compareTabId, (snapshot) =>
          applyCompareErrorToSnapshot(snapshot, compareId, message),
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '对比失败'
      if (useCompareStore.getState().activeCompareId === compareId) {
        store.setError(message, compareId)
      }
      useAppStore.getState().updateCompareTabSnapshot(compareTabId, (snapshot) =>
        applyCompareErrorToSnapshot(snapshot, compareId, message),
      )
    }
  }, [store, setPage])

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

  const loading = scanning || comparing

  return {
    leftPath,
    rightPath,
    strategies,
    loading,
    scanning,
    comparing,
    done,
    error,
    entries,
    runCompare,
    rerunActiveSessionIfRunning,
  }
}
