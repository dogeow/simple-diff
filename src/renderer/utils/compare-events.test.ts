import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompareEntry, FileEntry } from '../../../shared/types'
import { useAppStore } from '../stores/app-store'
import { useCompareStore } from '../stores/compare-store'
import { bindCompareEvents, flushBufferedCompareEvents } from './compare-events'

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

async function flushCompareEvents(): Promise<void> {
  await vi.advanceTimersByTimeAsync(100)
}

describe('bindCompareEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetCompareStore()
    resetAppStore()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    resetCompareStore()
    resetAppStore()
  })

  it('forwards scan and entry updates into the active compare store', async () => {
    let scanHandler: ((compareId: string, entries: readonly CompareEntry[]) => void) | null = null
    let entryHandler: ((compareId: string, entries: readonly CompareEntry[]) => void) | null = null
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

    scanHandler!('compare-1', [createCompareEntry('docs', { isDirectory: true })])
    entryHandler!('compare-1', [createCompareEntry('docs', { isDirectory: true, state: 'equal' })])

    await flushCompareEvents()

    const state = useCompareStore.getState()
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]?.relativePath).toBe('docs')
    expect(state.entries[0]?.state).toBe('equal')

    cleanup()
    expect(unsubscribeScan).toHaveBeenCalledTimes(1)
    expect(unsubscribeEntry).toHaveBeenCalledTimes(1)
  })

  it('does not mirror live active compare entries into app store snapshots', async () => {
    let scanHandler: ((compareId: string, entries: readonly CompareEntry[]) => void) | null = null
    let entryHandler: ((compareId: string, entries: readonly CompareEntry[]) => void) | null = null

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
        activeCompareId: 'compare-1',
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

    useCompareStore.getState().startScanning('compare-1')

    scanHandler!('compare-1', [createCompareEntry('docs', { isDirectory: true })])
    entryHandler!('compare-1', [createCompareEntry('docs', { isDirectory: true, state: 'equal' })])

    await flushCompareEvents()

    expect(useCompareStore.getState().entries).toHaveLength(1)
    const compareTab = useAppStore.getState().compareTabs[0]
    expect(compareTab?.snapshot.entries).toEqual([])
  })

  it('keeps stale compare events out of the current session', async () => {
    let scanHandler: ((compareId: string, entries: readonly CompareEntry[]) => void) | null = null

    bindCompareEvents({
      onScanComplete: (callback) => {
        scanHandler = callback
        return () => {}
      },
      onEntryUpdate: () => () => {},
    })

    useCompareStore.getState().startScanning('compare-1')
    scanHandler!('compare-2', [createCompareEntry('stale.txt')])

    await flushCompareEvents()

    expect(useCompareStore.getState().entries).toEqual([])
  })

  it('updates background compare tab snapshots by compare id', async () => {
    let scanHandler: ((compareId: string, entries: readonly CompareEntry[]) => void) | null = null
    let entryHandler: ((compareId: string, entries: readonly CompareEntry[]) => void) | null = null

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

    scanHandler!('compare-bg', [createCompareEntry('docs', { isDirectory: true })])
    entryHandler!('compare-bg', [createCompareEntry('docs', { isDirectory: true, state: 'equal' })])

    await flushCompareEvents()

    const compareTab = useAppStore.getState().compareTabs[0]
    expect(compareTab?.snapshot.entries).toHaveLength(1)
    expect(compareTab?.snapshot.entries[0]?.state).toBe('equal')
    expect(compareTab?.snapshot.comparing).toBe(true)
  })

  it('coalesces multiple same-frame events into one store flush', async () => {
    let scanHandler: ((compareId: string, entries: readonly CompareEntry[]) => void) | null = null
    let entryHandler: ((compareId: string, entries: readonly CompareEntry[]) => void) | null = null

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

    useCompareStore.getState().startScanning('compare-1')

    const setScanEntriesSpy = vi.spyOn(useCompareStore.getState(), 'setScanEntries')
    const updateEntriesSpy = vi.spyOn(useCompareStore.getState(), 'updateEntries')

    scanHandler!('compare-1', [createCompareEntry('docs', { isDirectory: true })])
    scanHandler!('compare-1', [createCompareEntry('docs/readme.md')])
    entryHandler!('compare-1', [createCompareEntry('docs', { isDirectory: true, state: 'equal' })])
    entryHandler!('compare-1', [createCompareEntry('docs/readme.md', { state: 'different' })])

    expect(setScanEntriesSpy).not.toHaveBeenCalled()
    expect(updateEntriesSpy).not.toHaveBeenCalled()

    await flushCompareEvents()

    expect(setScanEntriesSpy).toHaveBeenCalledTimes(1)
    expect(updateEntriesSpy).toHaveBeenCalledTimes(1)
    expect(useCompareStore.getState().entries.map((entry) => entry.relativePath)).toEqual(['docs', 'docs/readme.md'])
    expect(useCompareStore.getState().entries.map((entry) => entry.state)).toEqual(['equal', 'different'])
  })

  it('flushes already-buffered active compare events after pause', async () => {
    let entryHandler: ((compareId: string, entries: readonly CompareEntry[]) => void) | null = null

    bindCompareEvents({
      onScanComplete: () => () => {},
      onEntryUpdate: (callback) => {
        entryHandler = callback
        return () => {}
      },
    })

    useCompareStore.getState().startScanning('compare-1')

    entryHandler!('compare-1', [createCompareEntry('docs/readme.md', { state: 'different' })])
    useCompareStore.getState().pauseCompare('compare-1')

    await flushCompareEvents()

    const state = useCompareStore.getState()
    expect(state.paused).toBe(true)
    expect(state.activeCompareId).toBe('compare-1')
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]?.state).toBe('different')
  })

  it('can flush buffered events synchronously for a finished compare', () => {
    let entryHandler: ((compareId: string, entries: readonly CompareEntry[]) => void) | null = null

    bindCompareEvents({
      onScanComplete: () => () => {},
      onEntryUpdate: (callback) => {
        entryHandler = callback
        return () => {}
      },
    })

    useCompareStore.getState().startScanning('compare-1')
    entryHandler!('compare-1', [createCompareEntry('docs/readme.md', { state: 'different' })])

    flushBufferedCompareEvents('compare-1')

    const state = useCompareStore.getState()
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]?.state).toBe('different')
  })

  it('mirrors late paused compare updates into the active compare tab snapshot', async () => {
    let entryHandler: ((compareId: string, entries: readonly CompareEntry[]) => void) | null = null

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
        scanning: false,
        comparing: false,
        paused: true,
        done: false,
        error: null,
        duration: 0,
        leftSource: { type: 'local', path: '/left' },
        rightSource: { type: 'local', path: '/right' },
        loadingDirs: [],
        filter: 'all',
        expandedDirs: [],
        viewMode: 'split',
        activeCompareId: 'compare-1',
      },
      diffTabs: [],
      activeDiffTabId: null,
    })

    bindCompareEvents({
      onScanComplete: () => () => {},
      onEntryUpdate: (callback) => {
        entryHandler = callback
        return () => {}
      },
    })

    useCompareStore.getState().startScanning('compare-1')
    useCompareStore.getState().pauseCompare('compare-1')

    entryHandler!('compare-1', [createCompareEntry('docs/readme.md', { state: 'different' })])

    await flushCompareEvents()

    const compareTab = useAppStore.getState().compareTabs[0]
    expect(compareTab?.snapshot.entries).toHaveLength(1)
    expect(compareTab?.snapshot.entries[0]?.state).toBe('different')
  })

  it('keeps stale events out of background compare tabs after compare id rollover', async () => {
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

    scanHandler!('compare-old', [createCompareEntry('stale.txt')])

    await flushCompareEvents()

    const compareTab = useAppStore.getState().compareTabs[0]
    expect(compareTab?.snapshot.entries.map((entry) => entry.relativePath)).toEqual(['fresh.txt'])
  })
})