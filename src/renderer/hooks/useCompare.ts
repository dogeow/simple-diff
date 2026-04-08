import { useCallback, useEffect } from 'react'
import { useCompareStore } from '../stores/compare-store'
import { useAppStore } from '../stores/app-store'
import type { SourceConfig } from '../../../shared/types'

function buildSourceConfig(type: 'local' | 'sftp', path: string, sshConfigId: string): SourceConfig {
  if (type === 'sftp') {
    return { type: 'sftp', configId: sshConfigId, path }
  }
  return { type: 'local', path }
}

export function useCompare() {
  const store = useCompareStore()
  const setPage = useAppStore((s) => s.setPage)
  const {
    leftPath, rightPath, strategies, extensionFilter,
    leftSourceType, rightSourceType, leftSSHConfigId, rightSSHConfigId,
    scanning, comparing, done, error, entries,
  } = store

  // Listen for progressive IPC events
  useEffect(() => {
    const unsubScan = window.api.onScanComplete((scanEntries) => {
      useCompareStore.getState().setScanEntries(scanEntries)
    })
    const unsubEntry = window.api.onEntryUpdate((entry) => {
      useCompareStore.getState().updateEntry(entry)
    })
    return () => {
      unsubScan()
      unsubEntry()
    }
  }, [])

  const runCompare = useCallback(async () => {
    if (!leftPath || !rightPath) {
      store.setError('请选择左右两侧目录')
      return
    }

    const left = buildSourceConfig(leftSourceType, leftPath, leftSSHConfigId)
    const right = buildSourceConfig(rightSourceType, rightPath, rightSSHConfigId)

    // Start scanning — navigate immediately
    store.startScanning()
    store.setSources(left, right)
    setPage('compare')

    const response = await window.api.runCompare({
      left,
      right,
      strategies: [...strategies],
      extensionFilter: extensionFilter.length > 0 ? [...extensionFilter] : undefined,
    })

    if (response.success && response.data) {
      store.finishCompare(response.data)
    } else {
      store.setError(response.error ?? '对比失败')
    }
  }, [leftPath, rightPath, strategies, extensionFilter, leftSourceType, rightSourceType, leftSSHConfigId, rightSSHConfigId, store, setPage])

  const loading = scanning || comparing

  return { leftPath, rightPath, strategies, loading, scanning, comparing, done, error, entries, runCompare }
}
