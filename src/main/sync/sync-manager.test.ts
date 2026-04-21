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

  it('expands missing directories and syncs nested files', async () => {
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

    mocks.createFileSource
      .mockResolvedValueOnce(sourceFs)
      .mockResolvedValueOnce(targetFs)

    const { SyncManager } = await import('./sync-manager')
    const manager = new SyncManager()

    await manager.start({
      leftSource: leftSourceConfig,
      rightSource: rightSourceConfig,
      direction: 'left_to_right',
      entries: [createCompareDirEntry('books')],
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
})
