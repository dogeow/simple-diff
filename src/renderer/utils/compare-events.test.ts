import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompareEntry, FileEntry } from '../../../shared/types'
import { useAppStore } from '../stores/app-store'
import { useCompareStore } from '../stores/compare-store'
import { bindCompareEvents } from './compare-events'

function createFileEntry(name: string, overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    name,
    path: name,
    isDirectory: false,
    size: 1,
    mtime: 1,
    ...overrides,
  }
}

function createCompareEntry(relativePath: string, overrides: Partial<CompareEntry> = {}): CompareEntry {
  const name = relativePath.split('/').at(-1) ?? relativePath
  const isDirectory = overrides.isDirectory ?? false
  const baseFile = createFileEntry(name, { path: relativePath, isDirectory })

  return {
    relativePath,
    name,
    isDirectory,
    state: overrides.state ?? 'pending',
    left: overrides.left ?? baseFile,
    right: overrides.right ?? baseFile,
    reasons: overrides.reasons ?? [],
  }
}

function resetCompareStore(): void {
  useCompareStore.getState().resetCompare()
  useCompareStore.setState({
    leftPath: '',
    rightPath: '',
    leftSourceType: 'local',
    rightSourceType: 'local',
    leftSSHConfigId: '',
    rightSSHConfigId: '',
    strategies: ['size', 'mtime'],
    extensionFilter: ['node_modules', '.git', 'dist'],
    hideDot: true,
    hideDotFilter: 'all',
  })
}

function resetAppStore(): void {
  useAppStore.setState({
    page: 'home',
    diffTabs: [],
    activeDiffTabId: null,
    compareTabs: [],
    activeCompareTabId: null,
  })
}

describe('bindCompareEvents', () => {
  beforeEach(() => {
    resetCompareStore()
    resetAppStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetCompareStore()
    resetAppStore()
  })

  it('forwards scan and entry updates into the active compare store', () => {
    let scanHandler: ((compareId: string, entries: readonly CompareEntry[]) => void) | null = null
    let entryHandler: ((compareId: string, entry: CompareEntry) => void) | null = null
    const unsubscribeScan = vi.fn()
    const unsubscribeEntry = vi.fn()

    const cleanup = bindCompareEvents({
      onScanComplete: (callback) => {
        scanHandler = callback
        return unsubscribeScan
      },
      onEntryUpdate: (callback) => {
        entryHandler = callback
        return unsubscribeEntry
      },
    })

    useCompareStore.getState().startScanning('compare-1')

    scanHandler?.('compare-1', [createCompareEntry('docs', { isDirectory: true })])
    entryHandler?.('compare-1', createCompareEntry('docs', { isDirectory: true, state: 'equal' }))

    const state = useCompareStore.getState()
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]?.relativePath).toBe('docs')
    expect(state.entries[0]?.state).toBe('equal')

    cleanup()
    expect(unsubscribeScan).toHaveBeenCalledTimes(1)
    expect(unsubscribeEntry).toHaveBeenCalledTimes(1)
  })

  it('keeps stale compare events out of the current session', () => {
    let scanHandler: ((compareId: string, entries: readonly CompareEntry[]) => void) | null = null

    bindCompareEvents({
      onScanComplete: (callback) => {
        scanHandler = callback
        return () => {}
      },
      onEntryUpdate: () => () => {},
    })

    useCompareStore.getState().startScanning('compare-1')
    scanHandler?.('compare-2', [createCompareEntry('stale.txt')])

    expect(useCompareStore.getState().entries).toEqual([])
  })

  it('updates background compare tab snapshots by compare id', () => {
    let scanHandler: ((compareId: string, entries: readonly CompareEntry[]) => void) | null = null
    let entryHandler: ((compareId: string, entry: CompareEntry) => void) | null = null

    useAppStore.getState().saveCompareTab({
      id: 'compare-tab-1',
      title: 'docs',
      snapshot: {
        leftPath: '/left',
        rightPath: '/right',
        leftSourceType: 'local',
        rightSourceType: 'local',
        leftSSHConfigId: '',
        rightSSHConfigId: '',
        strategies: ['size', 'mtime'],
        extensionFilter: [],
        hideDot: true,
        hideDotFilter: 'all',
        entries: [],
        scanning: true,
        comparing: false,
        paused: false,
        done: false,
        error: null,
        duration: 0,
        leftSource: { type: 'local', path: '/left' },
        rightSource: { type: 'local', path: '/right' },
        loadingDirs: [],
        filter: 'all',
        expandedDirs: [],
        viewMode: 'split',
        activeCompareId: 'compare-bg',
      },
      diffTabs: [],
      activeDiffTabId: null,
    })

    bindCompareEvents({
      onScanComplete: (callback) => {
        scanHandler = callback
        return () => {}
      },
      onEntryUpdate: (callback) => {
        entryHandler = callback
        return () => {}
      },
    })

    scanHandler?.('compare-bg', [createCompareEntry('docs', { isDirectory: true })])
    entryHandler?.('compare-bg', createCompareEntry('docs', { isDirectory: true, state: 'equal' }))

    const compareTab = useAppStore.getState().compareTabs[0]
    expect(compareTab?.snapshot.entries).toHaveLength(1)
    expect(compareTab?.snapshot.entries[0]?.state).toBe('equal')
    expect(compareTab?.snapshot.comparing).toBe(true)
  })

  it('keeps stale events out of background compare tabs after compare id rollover', () => {
    let scanHandler: ((compareId: string, entries: readonly CompareEntry[]) => void) | null = null

    useAppStore.getState().saveCompareTab({
      id: 'compare-tab-1',
      title: 'docs',
      snapshot: {
        leftPath: '/left',
        rightPath: '/right',
        leftSourceType: 'local',
        rightSourceType: 'local',
        leftSSHConfigId: '',
        rightSSHConfigId: '',
        strategies: ['size', 'mtime'],
        extensionFilter: [],
        hideDot: true,
        hideDotFilter: 'all',
        entries: [createCompareEntry('fresh.txt', { state: 'pending' })],
        scanning: true,
        comparing: true,
        paused: false,
        done: false,
        error: null,
        duration: 0,
        leftSource: { type: 'local', path: '/left' },
        rightSource: { type: 'local', path: '/right' },
        loadingDirs: [],
        filter: 'all',
        expandedDirs: [],
        viewMode: 'split',
        activeCompareId: 'compare-new',
      },
      diffTabs: [],
      activeDiffTabId: null,
    })

    bindCompareEvents({
      onScanComplete: (callback) => {
        scanHandler = callback
        return () => {}
      },
      onEntryUpdate: () => () => {},
    })

    scanHandler?.('compare-old', [createCompareEntry('stale.txt')])

    const compareTab = useAppStore.getState().compareTabs[0]
    expect(compareTab?.snapshot.entries.map((entry) => entry.relativePath)).toEqual(['fresh.txt'])
  })
})