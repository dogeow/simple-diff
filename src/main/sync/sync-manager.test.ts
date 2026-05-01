import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompareEntry, FileEntry, SourceConfig } from '@shared/types'
import type { FileSource } from '../file-source'
import type { PersistedSyncTask } from './sync-store'

const mocks = vi.hoisted(() => {
  let persistedTask: PersistedSyncTask | null = null

  return {
    createFileSource: vi.fn(),
    loggerInfo: vi.fn(),
    loggerError: vi.fn(),
    loggerWarn: vi.fn(),
    getSyncTask: vi.fn(() => persistedTask),
    setSyncTask: vi.fn((task: PersistedSyncTask | null) => {
      persistedTask = task
    }),
    resetStore: () => {
      persistedTask = null
    },
  }
})

vi.mock('../file-source', () => ({
  createFileSource: mocks.createFileSource,
}))

vi.mock('../utils/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    child: vi.fn(() => ({
      info: mocks.loggerInfo,
      warn: mocks.loggerWarn,
      error: mocks.loggerError,
      child: vi.fn(),
    })),
  },
}))

vi.mock('./sync-store', () => ({
  getSyncTask: mocks.getSyncTask,
  setSyncTask: mocks.setSyncTask,
}))

function createFileEntry(name: string, isDirectory: boolean): FileEntry {
  return {
    name,
    path: name,
    isDirectory,
    size: isDirectory ? 0 : 3,
    mtime: 1,
  }
}

function createFileSourceMock(overrides: Partial<FileSource> = {}): FileSource {
  return {
    type: 'local',
    list: vi.fn(async () => []),
    stat: vi.fn(async () => createFileEntry('file.txt', false)),
    readDir: vi.fn(async () => []),
    exists: vi.fn(async () => true),
    readText: vi.fn(async () => ''),
    readFileBuffer: vi.fn(async () => Buffer.from('abc')),
    hashFile: vi.fn(async () => ''),
    hashFileRange: vi.fn(async () => ''),
    writeText: vi.fn(async () => {}),
    writeFileBuffer: vi.fn(async () => {}),
    ensureDir: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
    ...overrides,
  }
}

function createCompareDirEntry(relativePath: string): CompareEntry {
  return {
    relativePath,
    name: relativePath.split('/').at(-1) ?? relativePath,
    isDirectory: true,
    state: 'left_only',
    left: { name: relativePath, path: relativePath, isDirectory: true, size: 0, mtime: 1 },
    reasons: [],
  }
}

function createCompareFileEntry(relativePath: string): CompareEntry {
  return {
    relativePath,
    name: relativePath.split('/').at(-1) ?? relativePath,
    isDirectory: false,
    state: 'left_only',
    left: { name: relativePath, path: relativePath, isDirectory: false, size: 3, mtime: 1 },
    reasons: [],
  }
}

async function waitFor(condition: () => boolean, timeoutMs = 250): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('Timed out waiting for condition')
}

describe('SyncManager', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.resetStore()
  })

  it('hydrates directory work upfront so total items stay fixed during sync', async () => {
    const leftSourceConfig: SourceConfig = { type: 'local', path: '/left' }
    const rightSourceConfig: SourceConfig = { type: 'local', path: '/right' }

    const sourceFs = createFileSourceMock({
      list: vi.fn(async (dirPath: string) => {
        if (dirPath === '/left/books') {
          return [
            createFileEntry('nested', true),
            createFileEntry('top.txt', false),
          ]
        }
        if (dirPath === '/left/books/nested') {
          return [
            createFileEntry('child.txt', false),
          ]
        }
        return []
      }),
      readFileBuffer: vi.fn(async (filePath: string) => Buffer.from(`content:${filePath}`)),
    })

    const targetFs = createFileSourceMock()

    mocks.createFileSource.mockImplementation(async (config: SourceConfig) => (
      config.path === '/left' ? sourceFs : targetFs
    ))

    const { SyncManager } = await import('./sync-manager')
    const manager = new SyncManager()

    const snapshot = await manager.start({
      leftSource: leftSourceConfig,
      rightSource: rightSourceConfig,
      direction: 'left_to_right',
      entries: [createCompareDirEntry('books')],
    })

    expect(snapshot).toMatchObject({
      status: 'running',
      completedItems: 0,
      totalItems: 4,
    })

    await waitFor(() => manager.getSnapshot()?.status === 'completed')

    expect(targetFs.ensureDir).toHaveBeenCalledWith('/right/books')
    expect(targetFs.ensureDir).toHaveBeenCalledWith('/right/books/nested')
    expect(targetFs.writeFileBuffer).toHaveBeenCalledWith('/right/books/top.txt', Buffer.from('content:/left/books/top.txt'))
    expect(targetFs.writeFileBuffer).toHaveBeenCalledWith('/right/books/nested/child.txt', Buffer.from('content:/left/books/nested/child.txt'))
    expect(sourceFs.list).toHaveBeenCalledWith('/left/books')
    expect(sourceFs.list).toHaveBeenCalledWith('/left/books/nested')
    expect(manager.getSnapshot()).toMatchObject({
      status: 'completed',
      completedItems: 4,
      totalItems: 4,
    })
  })

  it('rehydrates paused directory tasks before resume so totals do not keep growing', async () => {
    const leftSourceConfig: SourceConfig = { type: 'local', path: '/left' }
    const rightSourceConfig: SourceConfig = { type: 'local', path: '/right' }

    const sourceFs = createFileSourceMock({
      list: vi.fn(async (dirPath: string) => {
        if (dirPath === '/left/books') {
          return [
            createFileEntry('nested', true),
            createFileEntry('top.txt', false),
          ]
        }
        if (dirPath === '/left/books/nested') {
          return [
            createFileEntry('child.txt', false),
          ]
        }
        return []
      }),
      readFileBuffer: vi.fn(async (filePath: string) => Buffer.from(`content:${filePath}`)),
    })

    const targetFs = createFileSourceMock()

    mocks.createFileSource.mockImplementation(async (config: SourceConfig) => (
      config.path === '/left' ? sourceFs : targetFs
    ))

    mocks.setSyncTask({
      id: 'persisted-sync',
      leftSource: leftSourceConfig,
      rightSource: rightSourceConfig,
      direction: 'left_to_right',
      status: 'paused',
      pendingItems: [{ relativePath: 'books', kind: 'directory' }],
      pendingDirs: ['books'],
      totalItems: 1,
      completedItems: 0,
      currentPath: null,
      lastCompletedPath: null,
      lastError: null,
      createdAt: 1,
      updatedAt: 1,
    })

    const { SyncManager } = await import('./sync-manager')
    const manager = new SyncManager()

    const snapshot = await manager.resume()

    expect(snapshot).toMatchObject({
      status: 'running',
      completedItems: 0,
      totalItems: 4,
    })

    await waitFor(() => manager.getSnapshot()?.status === 'completed')

    expect(manager.getSnapshot()).toMatchObject({
      status: 'completed',
      completedItems: 4,
      totalItems: 4,
    })
  })

  it('does not persist every item while syncing large queues', async () => {
    const leftSourceConfig: SourceConfig = { type: 'local', path: '/left' }
    const rightSourceConfig: SourceConfig = { type: 'local', path: '/right' }
    const entries = Array.from({ length: 100 }, (_unused, index) =>
      createCompareFileEntry(`file-${index}.txt`),
    )

    const sourceFs = createFileSourceMock({
      readFileBuffer: vi.fn(async (filePath: string) => Buffer.from(`content:${filePath}`)),
    })
    const targetFs = createFileSourceMock()

    mocks.createFileSource.mockImplementation(async (config: SourceConfig) => (
      config.path === '/left' ? sourceFs : targetFs
    ))

    const { SyncManager } = await import('./sync-manager')
    const manager = new SyncManager()

    await manager.start({
      leftSource: leftSourceConfig,
      rightSource: rightSourceConfig,
      direction: 'left_to_right',
      entries,
    })

    await waitFor(() => manager.getSnapshot()?.status === 'completed')

    expect(targetFs.writeFileBuffer).toHaveBeenCalledTimes(entries.length)
    expect(mocks.setSyncTask.mock.calls.length).toBeLessThan(10)
    expect(manager.getSnapshot()).toMatchObject({
      status: 'completed',
      completedItems: entries.length,
      totalItems: entries.length,
    })
  })

  it('appends another directory to the running sync task when sources and direction match', async () => {
    const leftSourceConfig: SourceConfig = { type: 'local', path: '/left' }
    const rightSourceConfig: SourceConfig = { type: 'local', path: '/right' }

    let releaseFirstFile: (() => void) | null = null
    const sourceFs = createFileSourceMock({
      list: vi.fn(async (dirPath: string) => {
        if (dirPath === '/left/books') {
          return [createFileEntry('book.txt', false)]
        }
        if (dirPath === '/left/images') {
          return [createFileEntry('cover.png', false)]
        }
        return []
      }),
      readFileBuffer: vi.fn(async (filePath: string) => Buffer.from(`content:${filePath}`)),
    })

    const targetFs = createFileSourceMock({
      writeFileBuffer: vi.fn(async (filePath: string, content: Buffer) => {
        if (filePath === '/right/books/book.txt' && releaseFirstFile) {
          await new Promise<void>((resolve) => {
            releaseFirstFile = resolve
          })
        }

        return Promise.resolve(content)
      }),
    })

    mocks.createFileSource.mockImplementation(async (config: SourceConfig) => (
      config.path === '/left' ? sourceFs : targetFs
    ))

    const { SyncManager } = await import('./sync-manager')
    const manager = new SyncManager()

    releaseFirstFile = () => undefined
    const firstStart = manager.start({
      leftSource: leftSourceConfig,
      rightSource: rightSourceConfig,
      direction: 'left_to_right',
      entries: [createCompareDirEntry('books')],
    })

    await waitFor(() => manager.getSnapshot()?.currentPath === 'books/book.txt')

    const appendedSnapshot = await manager.start({
      leftSource: leftSourceConfig,
      rightSource: rightSourceConfig,
      direction: 'left_to_right',
      entries: [createCompareDirEntry('images')],
    })

    expect(appendedSnapshot).toMatchObject({
      status: 'running',
      totalItems: 4,
      completedItems: 1,
    })

    const resolveFirstFile = releaseFirstFile
    releaseFirstFile = null
    resolveFirstFile?.()

    await firstStart
    await waitFor(() => manager.getSnapshot()?.status === 'completed')

    expect(sourceFs.list).toHaveBeenCalledWith('/left/books')
    expect(sourceFs.list).toHaveBeenCalledWith('/left/images')
    expect(targetFs.ensureDir).toHaveBeenCalledWith('/right/books')
    expect(targetFs.ensureDir).toHaveBeenCalledWith('/right/images')
    expect(targetFs.writeFileBuffer).toHaveBeenCalledWith('/right/books/book.txt', Buffer.from('content:/left/books/book.txt'))
    expect(targetFs.writeFileBuffer).toHaveBeenCalledWith('/right/images/cover.png', Buffer.from('content:/left/images/cover.png'))
    expect(manager.getSnapshot()).toMatchObject({
      status: 'completed',
      completedItems: 4,
      totalItems: 4,
    })
  })
})
