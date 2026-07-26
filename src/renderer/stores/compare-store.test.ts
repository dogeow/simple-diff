import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompareEntry, FileEntry, IpcResult, SourceConfig } from '../../../shared/types'
import { applyPauseCompareToSnapshot, applyPausedCompareErrorToSnapshot, hasCompareSessionContent, useCompareStore } from './compare-store'

const leftSource: SourceConfig = { type: 'local', path: '/left' }
const rightSource: SourceConfig = { type: 'local', path: '/right' }

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

function createCompareEntry(
  relativePath: string,
  overrides: Partial<CompareEntry> = {},
): CompareEntry {
  const name = relativePath.split('/').at(-1) ?? relativePath
  const isDirectory = overrides.isDirectory ?? false
  const baseFile = createFileEntry(name, { path: relativePath, isDirectory })

  return {
    relativePath,
    name,
    isDirectory,
    state: overrides.state ?? 'equal',
    left: overrides.left ?? baseFile,
    right: overrides.right ?? baseFile,
    reasons: overrides.reasons ?? [],
  }
}

function resetCompareStore(): void {
  const state = useCompareStore.getState()
  state.resetCompare()
  useCompareStore.setState({
    leftPath: '',
    rightPath: '',
    leftSourceType: 'local',
    rightSourceType: 'local',
    leftSSHConfigId: '',
    rightSSHConfigId: '',
    strategies: ['size', 'mtime'],
    extensionFilter: ['node_modules', '.git', 'dist', '.DS_Store'],
    hideDot: false,
    hideDotFilter: 'all',
  })
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('compare-store', () => {
  beforeEach(() => {
    resetCompareStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resetCompareStore()
  })

  it('upserts scan batches and entry updates by relative path', () => {
    const store = useCompareStore.getState()
    store.startScanning('compare-1')

    store.setScanEntries('compare-1', [
      createCompareEntry('src/file.txt', { state: 'pending' }),
      createCompareEntry('docs/readme.md', { state: 'equal' }),
    ])

    store.setScanEntries('compare-1', [
      createCompareEntry('src/file.txt', { state: 'equal' }),
    ])

    store.updateEntries('compare-1', [createCompareEntry('docs/readme.md', { state: 'different' })])

    const { entries } = useCompareStore.getState()
    expect(entries).toHaveLength(2)
    expect(entries.find((entry) => entry.relativePath === 'src/file.txt')?.state).toBe('equal')
    expect(entries.find((entry) => entry.relativePath === 'docs/readme.md')?.state).toBe('different')

    expect(useCompareStore.getState().entrySummary).toEqual({
      stats: {
        total: 2,
        equal: 1,
        different: 1,
        leftOnly: 0,
        rightOnly: 0,
      },
      pendingCount: 0,
      allDirCount: 0,
    })
  })

  it('ignores updates from stale compare ids', () => {
    const store = useCompareStore.getState()
    store.startScanning('compare-1')
    store.setScanEntries('compare-1', [createCompareEntry('src/file.txt', { state: 'pending' })])

    store.setScanEntries('compare-2', [createCompareEntry('src/file.txt', { state: 'different' })])
    store.updateEntries('compare-2', [createCompareEntry('src/file.txt', { state: 'different' })])

    const { entries } = useCompareStore.getState()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.state).toBe('pending')
  })

  it('derives entry summary for direct setState entry fixtures', () => {
    useCompareStore.setState({
      entries: [
        createCompareEntry('src', { isDirectory: true, state: 'equal' }),
        createCompareEntry('src/file.txt', { state: 'different' }),
      ],
    })

    expect(useCompareStore.getState().entrySummary).toEqual({
      stats: {
        total: 2,
        equal: 1,
        different: 1,
        leftOnly: 0,
        rightOnly: 0,
      },
      pendingCount: 0,
      allDirCount: 1,
    })
  })

  it('hydrates rerunnable source fields from source configs', () => {
    const store = useCompareStore.getState()

    store.setSources(
      { type: 'sftp', configId: 'left-ssh', path: '/remote/left' },
      { type: 'local', path: '/local/right' },
    )

    const state = useCompareStore.getState()
    expect(state.leftSource).toEqual({ type: 'sftp', configId: 'left-ssh', path: '/remote/left' })
    expect(state.rightSource).toEqual({ type: 'local', path: '/local/right' })
    expect(state.leftSourceType).toBe('sftp')
    expect(state.leftSSHConfigId).toBe('left-ssh')
    expect(state.leftPath).toBe('/remote/left')
    expect(state.rightSourceType).toBe('local')
    expect(state.rightSSHConfigId).toBe('')
    expect(state.rightPath).toBe('/local/right')
  })

  it('does not hide dot entries by default', () => {
    expect(useCompareStore.getState().hideDot).toBe(false)
  })

  it('hydrates source inputs without replacing the active compare sources', () => {
    const store = useCompareStore.getState()

    useCompareStore.setState({
      leftSource: { type: 'local', path: '/active/left' },
      rightSource: { type: 'local', path: '/active/right' },
    })

    store.hydrateSourceInputs(
      { type: 'sftp', configId: 'left-ssh', path: '/remote/left' },
      { type: 'sftp', configId: 'right-ssh', path: '/remote/right' },
    )

    const state = useCompareStore.getState()
    expect(state.leftPath).toBe('/remote/left')
    expect(state.rightPath).toBe('/remote/right')
    expect(state.leftSourceType).toBe('sftp')
    expect(state.rightSourceType).toBe('sftp')
    expect(state.leftSSHConfigId).toBe('left-ssh')
    expect(state.rightSSHConfigId).toBe('right-ssh')
    expect(state.leftSource).toEqual({ type: 'local', path: '/active/left' })
    expect(state.rightSource).toEqual({ type: 'local', path: '/active/right' })
  })

  it('creates and restores compare snapshots for tab switching', () => {
    const store = useCompareStore.getState()

    useCompareStore.setState({
      leftPath: '/saved/left',
      rightPath: '/saved/right',
      leftSourceType: 'sftp',
      rightSourceType: 'local',
      leftSSHConfigId: 'ssh-left',
      strategies: ['hash'],
      extensionFilter: ['path:config'],
      hideDot: false,
      hideDotFilter: 'dirs',
      entries: [createCompareEntry('config/app.php', { state: 'different' })],
      scanning: false,
      comparing: false,
      paused: false,
      done: true,
      error: null,
      duration: 99,
      leftSource: { type: 'sftp', configId: 'ssh-left', path: '/saved/left' },
      rightSource: { type: 'local', path: '/saved/right' },
      loadingDirs: new Set(['config']),
      filter: 'different',
      expandedDirs: new Set(['config']),
      viewMode: 'merged',
      activeCompareId: 'compare-saved',
    })

    const snapshot = store.createSnapshot()

    useCompareStore.setState({
      leftPath: '/other/left',
      rightPath: '/other/right',
      strategies: ['size'],
      extensionFilter: [],
      entries: [],
      expandedDirs: new Set(),
      viewMode: 'split',
      activeCompareId: 'compare-other',
    })

    store.restoreSnapshot(snapshot)

    const currentState = useCompareStore.getState()
    expect(currentState.leftPath).toBe('/saved/left')
    expect(currentState.rightPath).toBe('/saved/right')
    expect(currentState.leftSourceType).toBe('sftp')
    expect(currentState.leftSSHConfigId).toBe('ssh-left')
    expect(currentState.strategies).toEqual(['hash'])
    expect(currentState.extensionFilter).toEqual(['path:config'])
    expect(currentState.hideDot).toBe(false)
    expect(currentState.hideDotFilter).toBe('dirs')
    expect(currentState.entries.map((entry) => entry.relativePath)).toEqual(['config/app.php'])
    expect(currentState.expandedDirs.has('config')).toBe(true)
    expect(currentState.loadingDirs.has('config')).toBe(true)
    expect(currentState.viewMode).toBe('merged')
    expect(currentState.activeCompareId).toBe('compare-saved')
  })

  it('clears stale unresolved entries when restoring an inactive unfinished snapshot', () => {
    const store = useCompareStore.getState()

    store.restoreSnapshot({
      leftPath: '/saved/left',
      rightPath: '/saved/right',
      leftSourceType: 'local',
      rightSourceType: 'local',
      leftSSHConfigId: '',
      rightSSHConfigId: '',
      strategies: ['size', 'mtime'],
      extensionFilter: ['path:bootstrap'],
      hideDot: true,
      hideDotFilter: 'all',
      entries: [
        createCompareEntry('bootstrap', {
          isDirectory: true,
          state: 'pending',
          left: createFileEntry('bootstrap', { path: 'bootstrap', isDirectory: true }),
          right: createFileEntry('bootstrap', { path: 'bootstrap', isDirectory: true }),
        }),
        createCompareEntry('deploy.php', { state: 'different' }),
      ],
      scanning: false,
      comparing: false,
      paused: false,
      done: false,
      error: null,
      duration: 123,
      leftSource,
      rightSource,
      dirtyPaths: [],
      loadingDirs: [],
      filter: 'all',
      expandedDirs: ['bootstrap'],
      viewMode: 'split',
      activeCompareId: null,
    })

    const currentState = useCompareStore.getState()
    expect(currentState.entries).toEqual([])
    expect(currentState.duration).toBe(0)
    expect(currentState.expandedDirs.size).toBe(0)
    expect(currentState.done).toBe(false)
    expect(currentState.extensionFilter).toEqual(['path:bootstrap'])
  })

  it('treats home-page draft inputs as non-session state', () => {
    useCompareStore.setState({
      leftPath: '/draft/left',
      rightPath: '/draft/right',
      leftSourceType: 'local',
      rightSourceType: 'local',
      leftSource: null,
      rightSource: null,
      entries: [],
      scanning: false,
      comparing: false,
      done: false,
      error: null,
      activeCompareId: null,
    })

    expect(hasCompareSessionContent(useCompareStore.getState().createSnapshot())).toBe(false)
  })

  it('loads directory children once and clears loading state after lazy loading', async () => {
    const listFiles = vi.fn<(
      source: SourceConfig,
      dirPath: string,
    ) => Promise<IpcResult<readonly FileEntry[]>>>()

    listFiles.mockImplementation(async (source, dirPath) => {
      if (source.type === 'local' && dirPath === '/left/src') {
        return {
          success: true,
          data: [createFileEntry('shared.txt', { size: 10, mtime: 1000 })],
        }
      }
      if (source.type === 'local' && dirPath === '/right/src') {
        return {
          success: true,
          data: [createFileEntry('shared.txt', { size: 10, mtime: 1000 })],
        }
      }
      return { success: false, error: `unexpected path: ${dirPath}` }
    })

    vi.stubGlobal('window', {
      api: { listFiles },
    })

    useCompareStore.setState({
      leftSource,
      rightSource,
      entries: [
        createCompareEntry('src', {
          isDirectory: true,
          state: 'equal',
          left: createFileEntry('src', { path: 'src', isDirectory: true }),
          right: createFileEntry('src', { path: 'src', isDirectory: true }),
        }),
      ],
    })

    const store = useCompareStore.getState()
    store.expandDir('src')

    expect(useCompareStore.getState().expandedDirs.has('src')).toBe(true)
    expect(useCompareStore.getState().loadingDirs.has('src')).toBe(true)

    await flushAsyncWork()

    const loadedState = useCompareStore.getState()
    expect(loadedState.loadingDirs.has('src')).toBe(false)
    expect(loadedState.entries.map((entry) => entry.relativePath)).toEqual(['src', 'src/shared.txt'])
    expect(listFiles).toHaveBeenCalledTimes(2)

    store.expandDir('src')
    expect(useCompareStore.getState().expandedDirs.has('src')).toBe(false)

    store.expandDir('src')
    await flushAsyncWork()

    expect(useCompareStore.getState().expandedDirs.has('src')).toBe(true)
    expect(listFiles).toHaveBeenCalledTimes(2)
    expect(useCompareStore.getState().entries).toHaveLength(2)
  })

  it('ignores stale lazy-load results after a new compare starts', async () => {
    // 初始化为 no-op，避免 TS 控制流把闭包内赋值后的变量收窄成 null
    let resolveLeft: (value: IpcResult<readonly FileEntry[]>) => void = () => undefined
    let resolveRight: (value: IpcResult<readonly FileEntry[]>) => void = () => undefined
    type ListFiles = (
      source: SourceConfig,
      dirPath: string,
    ) => Promise<IpcResult<readonly FileEntry[]>>

    const listFiles = vi.fn<ListFiles>((source, dirPath) => new Promise((resolve) => {
      if (source.type === 'local' && dirPath === '/left/src') {
        resolveLeft = resolve
        return
      }
      if (source.type === 'local' && dirPath === '/right/src') {
        resolveRight = resolve
        return
      }
      resolve({ success: false, error: `unexpected path: ${dirPath}` })
    }))

    vi.stubGlobal('window', {
      api: { listFiles },
    })

    useCompareStore.setState({
      leftSource,
      rightSource,
      entries: [
        createCompareEntry('src', {
          isDirectory: true,
          state: 'equal',
          left: createFileEntry('src', { path: 'src', isDirectory: true }),
          right: createFileEntry('src', { path: 'src', isDirectory: true }),
        }),
      ],
    })

    const store = useCompareStore.getState()
    store.startScanning('compare-1')
    useCompareStore.setState({
      leftSource,
      rightSource,
      entries: [
        createCompareEntry('src', {
          isDirectory: true,
          state: 'equal',
          left: createFileEntry('src', { path: 'src', isDirectory: true }),
          right: createFileEntry('src', { path: 'src', isDirectory: true }),
        }),
      ],
    })

    store.expandDir('src')
    expect(useCompareStore.getState().loadingDirs.has('src')).toBe(true)

    store.startScanning('compare-2')
    expect(useCompareStore.getState().loadingDirs.has('src')).toBe(false)
    expect(useCompareStore.getState().entries).toHaveLength(0)

    resolveLeft({
      success: true,
      data: [createFileEntry('stale-left.txt', { size: 10, mtime: 1000 })],
    })
    resolveRight({
      success: true,
      data: [createFileEntry('stale-left.txt', { size: 10, mtime: 1000 })],
    })

    await flushAsyncWork()

    const currentState = useCompareStore.getState()
    expect(currentState.activeCompareId).toBe('compare-2')
    expect(currentState.entries).toEqual([])
    expect(currentState.loadingDirs.has('src')).toBe(false)
  })

  it('refreshes a parent directory by replacing removed children and keeping unaffected descendants', async () => {
    const listFiles = vi.fn<(
      source: SourceConfig,
      dirPath: string,
    ) => Promise<IpcResult<readonly FileEntry[]>>>()

    listFiles.mockImplementation(async (source, dirPath) => {
      if (source.type === 'local' && dirPath === '/left/src') {
        return {
          success: true,
          data: [
            createFileEntry('keep-dir', { isDirectory: true }),
            createFileEntry('renamed.txt', { size: 10, mtime: 1000 }),
          ],
        }
      }
      if (source.type === 'local' && dirPath === '/right/src') {
        return {
          success: true,
          data: [
            createFileEntry('keep-dir', { isDirectory: true }),
            createFileEntry('renamed.txt', { size: 10, mtime: 1000 }),
          ],
        }
      }
      return { success: false, error: `unexpected path: ${dirPath}` }
    })

    vi.stubGlobal('window', {
      api: { listFiles },
    })

    useCompareStore.setState({
      leftSource,
      rightSource,
      entries: [
        createCompareEntry('src', {
          isDirectory: true,
          state: 'equal',
          left: createFileEntry('src', { path: 'src', isDirectory: true }),
          right: createFileEntry('src', { path: 'src', isDirectory: true }),
        }),
        createCompareEntry('src/old.txt', { state: 'equal' }),
        createCompareEntry('src/keep-dir', {
          isDirectory: true,
          state: 'equal',
          left: createFileEntry('keep-dir', { path: 'src/keep-dir', isDirectory: true }),
          right: createFileEntry('keep-dir', { path: 'src/keep-dir', isDirectory: true }),
        }),
        createCompareEntry('src/keep-dir/nested.txt', { state: 'different' }),
      ],
    })

    await useCompareStore.getState().refreshDir('src')

    const currentState = useCompareStore.getState()
    expect(currentState.loadingDirs.has('src')).toBe(false)
    expect(currentState.entries.map((entry) => entry.relativePath)).toEqual([
      'src',
      'src/keep-dir',
      'src/keep-dir/nested.txt',
      'src/renamed.txt',
    ])
    expect(listFiles).toHaveBeenCalledTimes(2)
  })

  it('marks refreshed shared directories as pending until they are compared again', async () => {
    const listFiles = vi.fn<(
      source: SourceConfig,
      dirPath: string,
    ) => Promise<IpcResult<readonly FileEntry[]>>>()

    listFiles.mockImplementation(async (source, dirPath) => {
      if (source.type === 'local' && dirPath === '/left/src') {
        return {
          success: true,
          data: [createFileEntry('nested', { isDirectory: true })],
        }
      }
      if (source.type === 'local' && dirPath === '/right/src') {
        return {
          success: true,
          data: [createFileEntry('nested', { isDirectory: true })],
        }
      }
      return { success: false, error: `unexpected path: ${dirPath}` }
    })

    vi.stubGlobal('window', {
      api: { listFiles },
    })

    useCompareStore.setState({
      leftSource,
      rightSource,
      entries: [
        createCompareEntry('src', {
          isDirectory: true,
          state: 'equal',
          left: createFileEntry('src', { path: 'src', isDirectory: true }),
          right: createFileEntry('src', { path: 'src', isDirectory: true }),
        }),
      ],
    })

    await useCompareStore.getState().refreshDir('src')

    const nestedDir = useCompareStore.getState().entries.find((entry) => entry.relativePath === 'src/nested')
    expect(nestedDir?.state).toBe('pending')
  })

  it('surfaces directory listing failures instead of fabricating empty directories', async () => {
    const listFiles = vi.fn<(
      source: SourceConfig,
      dirPath: string,
    ) => Promise<IpcResult<readonly FileEntry[]>>>()

    listFiles.mockImplementation(async (source, dirPath) => {
      if (source.type === 'local' && dirPath === '/left/src') {
        return { success: false, error: '读取目录失败: 权限不足' }
      }
      return {
        success: true,
        data: [createFileEntry('kept.txt', { size: 10, mtime: 1000 })],
      }
    })

    vi.stubGlobal('window', {
      api: { listFiles },
    })

    useCompareStore.setState({
      leftSource,
      rightSource,
      entries: [
        createCompareEntry('src', {
          isDirectory: true,
          state: 'equal',
          left: createFileEntry('src', { path: 'src', isDirectory: true }),
          right: createFileEntry('src', { path: 'src', isDirectory: true }),
        }),
        createCompareEntry('src/kept.txt', { state: 'equal' }),
      ],
    })

    await useCompareStore.getState().refreshDir('src')

    const currentState = useCompareStore.getState()
    expect(currentState.error).toBe('读取目录失败: 权限不足')
    expect(currentState.loadingDirs.has('src')).toBe(false)
    // 列取失败时不得把子项替换成“空目录”结果
    expect(currentState.entries.map((entry) => entry.relativePath)).toEqual(['src', 'src/kept.txt'])
  })

  it('marks dirty paths and clears them after applying partial compare results', () => {
    useCompareStore.setState({
      entries: [
        createCompareEntry('src', {
          isDirectory: true,
          state: 'equal',
          left: createFileEntry('src', { path: 'src', isDirectory: true }),
          right: createFileEntry('src', { path: 'src', isDirectory: true }),
        }),
        createCompareEntry('src/old.txt', { state: 'equal' }),
        createCompareEntry('docs/readme.md', { state: 'equal' }),
      ],
    })

    const store = useCompareStore.getState()
    store.markDirtyPaths(['src/old.txt'])

    const dirtyState = useCompareStore.getState()
    expect(dirtyState.dirtyPaths.has('src/old.txt')).toBe(true)
    expect(dirtyState.dirtyDisplayPaths.has('src')).toBe(true)
    expect(dirtyState.dirtyDisplayPaths.has('src/old.txt')).toBe(true)

    store.applyPartialCompareResult(['src'], [
      createCompareEntry('src/new.txt', { state: 'different' }),
    ])

    const state = useCompareStore.getState()
    expect(state.dirtyPaths.size).toBe(0)
    expect(state.dirtyDisplayPaths.size).toBe(0)
    expect(state.entries.map((entry) => entry.relativePath)).toEqual([
      'src',
      'docs/readme.md',
      'src/new.txt',
    ])
  })

  it('clears the active compare id while retaining the sync session id when a compare finishes', () => {
    const store = useCompareStore.getState()
    store.startScanning('compare-1')

    store.finishCompare('compare-1', {
      entries: [createCompareEntry('done.txt', { state: 'equal' })],
      stats: { total: 1, equal: 1, different: 0, leftOnly: 0, rightOnly: 0 },
      duration: 42,
    })

    const state = useCompareStore.getState()
    expect(state.done).toBe(true)
    expect(state.activeCompareId).toBeNull()
    expect(state.compareSessionId).toBe('compare-1')
    expect(state.loadingDirs.size).toBe(0)
  })

  it('preserves streamed entries when a compare finishes without final entry payloads', () => {
    const store = useCompareStore.getState()
    store.startScanning('compare-1')

    store.setScanEntries('compare-1', [createCompareEntry('done.txt', { state: 'pending' })])
    store.updateEntries('compare-1', [createCompareEntry('done.txt', { state: 'equal' })])

    store.finishCompare('compare-1', {
      entries: [],
      entriesIncluded: false,
      stats: { total: 1, equal: 1, different: 0, leftOnly: 0, rightOnly: 0 },
      duration: 42,
    })

    const state = useCompareStore.getState()
    expect(state.done).toBe(true)
    expect(state.entries).toEqual([createCompareEntry('done.txt', { state: 'equal' })])
    expect(state.entrySummary.stats).toEqual({ total: 1, equal: 1, different: 0, leftOnly: 0, rightOnly: 0 })
  })

  it('can create a lightweight snapshot without carrying entries', () => {
    useCompareStore.setState({
      entries: [createCompareEntry('huge/file.txt', { state: 'equal' })],
      loadingDirs: new Set(['huge']),
      expandedDirs: new Set(['huge']),
      done: true,
    })

    const snapshot = useCompareStore.getState().createLightweightSnapshot()

    expect(snapshot.entries).toEqual([])
    expect(snapshot.loadingDirs).toEqual([])
    expect(snapshot.expandedDirs).toEqual([])
    expect(snapshot.done).toBe(true)
  })

  it('drops entries from tab snapshots once the result is very large', () => {
    const entries = Array.from({ length: 5001 }, (_unused, index) => createCompareEntry(`file-${index}.txt`, { state: 'equal' }))
    useCompareStore.setState({ entries, done: true })

    const snapshot = useCompareStore.getState().createTabSnapshot()

    expect(snapshot.entries).toEqual([])
    expect(snapshot.done).toBe(true)
  })

  it('writes paused compare errors even when the paused snapshot still keeps its compare id', () => {
    const store = useCompareStore.getState()
    store.startScanning('compare-1')

    const pausedSnapshot = applyPauseCompareToSnapshot(store.createSnapshot(), 'compare-1')
    const erroredSnapshot = applyPausedCompareErrorToSnapshot(pausedSnapshot, 'compare-1', 'network failed')

    expect(erroredSnapshot.paused).toBe(false)
    expect(erroredSnapshot.error).toBe('network failed')
    expect(erroredSnapshot.activeCompareId).toBeNull()
  })

  it('preserves existing entries when restarting the active compare session', () => {
    const store = useCompareStore.getState()

    useCompareStore.setState({
      entries: [createCompareEntry('src/app.ts', { state: 'different' })],
      filter: 'different',
      viewMode: 'merged',
      leftSource,
      rightSource,
    })

    store.startScanning('compare-rerun', { preserveEntries: true })

    const state = useCompareStore.getState()
    expect(state.activeCompareId).toBe('compare-rerun')
    expect(state.scanning).toBe(true)
    expect(state.entries.map((entry) => entry.relativePath)).toEqual(['src/app.ts'])
    expect(state.filter).toBe('different')
    expect(state.viewMode).toBe('merged')
  })

  it('invalidates compare results while preserving current inputs and mode', () => {
    const store = useCompareStore.getState()

    useCompareStore.setState({
      leftPath: '/changed/left',
      rightPath: '/changed/right',
      leftSource: leftSource,
      rightSource: rightSource,
      entries: [createCompareEntry('src/app.ts', { state: 'different' })],
      done: true,
      filter: 'different',
      viewMode: 'merged',
      activeCompareId: 'compare-1',
    })

    store.invalidateCompareResult()

    const state = useCompareStore.getState()
    expect(state.leftPath).toBe('/changed/left')
    expect(state.rightPath).toBe('/changed/right')
    expect(state.entries).toEqual([])
    expect(state.done).toBe(false)
    expect(state.leftSource).toBeNull()
    expect(state.rightSource).toBeNull()
    expect(state.activeCompareId).toBeNull()
    expect(state.filter).toBe('different')
    expect(state.viewMode).toBe('merged')
  })
})
