import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompareEntry, FileEntry, IpcResult, SourceConfig } from '../../../shared/types'
import { useCompareStore } from './compare-store'

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
    extensionFilter: ['node_modules', '.git', 'dist'],
    hideDot: true,
    hideDotFilter: 'all',
  })
}

async function flushAsyncWork(): Promise<void> {
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

    store.updateEntry('compare-1', createCompareEntry('docs/readme.md', { state: 'different' }))

    const { entries } = useCompareStore.getState()
    expect(entries).toHaveLength(2)
    expect(entries.find((entry) => entry.relativePath === 'src/file.txt')?.state).toBe('equal')
    expect(entries.find((entry) => entry.relativePath === 'docs/readme.md')?.state).toBe('different')
  })

  it('ignores updates from stale compare ids', () => {
    const store = useCompareStore.getState()
    store.startScanning('compare-1')
    store.setScanEntries('compare-1', [createCompareEntry('src/file.txt', { state: 'pending' })])

    store.setScanEntries('compare-2', [createCompareEntry('src/file.txt', { state: 'different' })])
    store.updateEntry('compare-2', createCompareEntry('src/file.txt', { state: 'different' }))

    const { entries } = useCompareStore.getState()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.state).toBe('pending')
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
})
