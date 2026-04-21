import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CompareEntry, FileEntry } from '@shared/types'
import type { FileSource } from '../file-source/types'
import { compareDirectories } from './comparator'

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

function createFileEntry(
  name: string,
  overrides: Partial<FileEntry> = {},
): FileEntry {
  return {
    name,
    path: name,
    isDirectory: false,
    size: 1,
    mtime: 1,
    ...overrides,
  }
}

interface MockSourceOptions {
  readonly type: 'local' | 'sftp'
  readonly listings: Record<string, readonly FileEntry[] | Error>
  readonly hashFile?: (filePath: string) => Promise<string>
  readonly hashFileRange?: (filePath: string, start: number, endInclusive: number) => Promise<string>
}

function createMockSource(options: MockSourceOptions): FileSource & {
  readonly list: ReturnType<typeof vi.fn>
  readonly hashFile: ReturnType<typeof vi.fn>
  readonly hashFileRange: ReturnType<typeof vi.fn>
} {
  const {
    type,
    listings,
    hashFile = async (filePath: string) => filePath,
    hashFileRange = async (filePath: string, start: number, endInclusive: number) =>
      `${filePath}:${start}-${endInclusive}`,
  } = options

  const list = vi.fn(async (dirPath: string) => {
    const listing = listings[dirPath]
    if (listing instanceof Error) throw listing
    return listing ?? []
  })

  const hashFileSpy = vi.fn(hashFile)
  const hashFileRangeSpy = vi.fn(hashFileRange)

  return {
    type,
    list,
    stat: vi.fn(async (filePath: string) => createFileEntry(filePath, { path: filePath })),
    readDir: vi.fn(async () => []),
    exists: vi.fn(async () => true),
    readText: vi.fn(async () => ''),
    readFileBuffer: vi.fn(async () => Buffer.alloc(0)),
    hashFile: hashFileSpy,
    hashFileRange: hashFileRangeSpy,
    writeText: vi.fn(async () => {}),
    writeFileBuffer: vi.fn(async () => {}),
    ensureDir: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('compareDirectories', () => {
  it('scans breadth-first and emits progressive scan/update events', async () => {
    const leftSource = createMockSource({
      type: 'local',
      listings: {
        '/left': [
          createFileEntry('src', { isDirectory: true, size: 0 }),
          createFileEntry('same.txt', { size: 10, mtime: 100 }),
          createFileEntry('diff.txt', { size: 10, mtime: 100 }),
          createFileEntry('left-only.txt', { size: 3, mtime: 100 }),
        ],
        '/left/src': [
          createFileEntry('child.txt', { size: 5, mtime: 100 }),
        ],
      },
    })
    const rightSource = createMockSource({
      type: 'local',
      listings: {
        '/right': [
          createFileEntry('src', { isDirectory: true, size: 0 }),
          createFileEntry('same.txt', { size: 10, mtime: 100 }),
          createFileEntry('diff.txt', { size: 20, mtime: 100 }),
        ],
        '/right/src': [
          createFileEntry('child.txt', { size: 5, mtime: 100 }),
        ],
      },
    })

    const scanBatches: string[][] = []
    const updates: Array<{ path: string; state: CompareEntry['state'] }> = []

    const result = await compareDirectories({
      leftSource,
      rightSource,
      leftRoot: '/left',
      rightRoot: '/right',
      strategies: ['size'],
      onEntriesFound: (entries) => {
        scanBatches.push(entries.map((entry) => entry.relativePath))
      },
      onEntryUpdate: (entry) => {
        updates.push({ path: entry.relativePath, state: entry.state })
      },
    })

    expect(scanBatches).toEqual([
      ['src', 'diff.txt', 'left-only.txt', 'same.txt'],
      ['src/child.txt'],
    ])
    expect(updates).toEqual([
      { path: 'src', state: 'equal' },
      { path: 'diff.txt', state: 'comparing' },
      { path: 'diff.txt', state: 'different' },
      { path: 'same.txt', state: 'comparing' },
      { path: 'same.txt', state: 'equal' },
      { path: 'src/child.txt', state: 'comparing' },
      { path: 'src/child.txt', state: 'equal' },
    ])
    expect(result.stats).toEqual({
      total: 5,
      equal: 3,
      different: 1,
      leftOnly: 1,
      rightOnly: 0,
    })
    expect(result.entries.map((entry) => [entry.relativePath, entry.state])).toEqual([
      ['src', 'equal'],
      ['diff.txt', 'different'],
      ['left-only.txt', 'left_only'],
      ['same.txt', 'equal'],
      ['src/child.txt', 'equal'],
    ])
  })

  it('skips filtered directories and does not recurse into them', async () => {
    const leftSource = createMockSource({
      type: 'local',
      listings: {
        '/left': [
          createFileEntry('node_modules', { isDirectory: true, size: 0 }),
          createFileEntry('src', { isDirectory: true, size: 0 }),
        ],
        '/left/src': [createFileEntry('app.ts', { size: 10, mtime: 100 })],
        '/left/node_modules': [createFileEntry('ignored.js', { size: 999 })],
      },
    })
    const rightSource = createMockSource({
      type: 'local',
      listings: {
        '/right': [
          createFileEntry('node_modules', { isDirectory: true, size: 0 }),
          createFileEntry('src', { isDirectory: true, size: 0 }),
        ],
        '/right/src': [createFileEntry('app.ts', { size: 10, mtime: 100 })],
        '/right/node_modules': [createFileEntry('ignored.js', { size: 999 })],
      },
    })

    const result = await compareDirectories({
      leftSource,
      rightSource,
      leftRoot: '/left',
      rightRoot: '/right',
      strategies: ['size'],
      extensionFilter: ['node_modules'],
    })

    expect(result.entries.map((entry) => entry.relativePath)).toEqual(['src', 'src/app.ts'])
    expect(leftSource.list.mock.calls.map(([dirPath]) => dirPath)).toEqual(['/left', '/left/src'])
    expect(rightSource.list.mock.calls.map(([dirPath]) => dirPath)).toEqual(['/right', '/right/src'])
  })

  it('passes joined file paths into quick hash comparison for local windows-style roots', async () => {
    const largeFileSize = 200_000
    const hashRange = async (_filePath: string, start: number) => `hash:${start}`

    const leftSource = createMockSource({
      type: 'local',
      listings: {
        'C:\\left': [createFileEntry('file.bin', { size: largeFileSize, mtime: 100 })],
      },
      hashFileRange: hashRange,
    })
    const rightSource = createMockSource({
      type: 'local',
      listings: {
        'C:\\right': [createFileEntry('file.bin', { size: largeFileSize, mtime: 100 })],
      },
      hashFileRange: hashRange,
    })

    const result = await compareDirectories({
      leftSource,
      rightSource,
      leftRoot: 'C:\\left',
      rightRoot: 'C:\\right',
      strategies: ['quick_hash'],
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.state).toBe('equal')
    expect(leftSource.hashFileRange.mock.calls.map(([filePath]) => filePath)).toEqual([
      'C:\\left\\file.bin',
      'C:\\left\\file.bin',
    ])
    expect(rightSource.hashFileRange.mock.calls.map(([filePath]) => filePath)).toEqual([
      'C:\\right\\file.bin',
      'C:\\right\\file.bin',
    ])
  })

  it('aborts when the signal is cancelled after a scan batch is emitted', async () => {
    const controller = new AbortController()
    const leftSource = createMockSource({
      type: 'local',
      listings: {
        '/left': [createFileEntry('file.txt', { size: 1, mtime: 100 })],
      },
    })
    const rightSource = createMockSource({
      type: 'local',
      listings: {
        '/right': [createFileEntry('file.txt', { size: 1, mtime: 100 })],
      },
    })

    await expect(compareDirectories({
      leftSource,
      rightSource,
      leftRoot: '/left',
      rightRoot: '/right',
      strategies: ['size'],
      signal: controller.signal,
      onEntriesFound: () => {
        controller.abort()
      },
    })).rejects.toThrow('对比已取消')
  })
})
