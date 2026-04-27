import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Dirent } from 'fs'

const readdirMock = vi.fn()
const statMock = vi.fn()

vi.mock('fs', () => ({
  createReadStream: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
  readdir: readdirMock,
  stat: statMock,
  access: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    })),
  },
}))

function createDirent(name: string, type: 'dir' | 'file'): Dirent<string> {
  return {
    name,
    parentPath: '',
    path: '',
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isDirectory: () => type === 'dir',
    isFIFO: () => false,
    isFile: () => type === 'file',
    isSocket: () => false,
    isSymbolicLink: () => false,
  } as Dirent<string>
}

describe('LocalSource', () => {
  beforeEach(() => {
    readdirMock.mockReset()
    statMock.mockReset()
  })

  it('lists directory entries without stat calls', async () => {
    readdirMock.mockResolvedValue([createDirent('Books', 'dir')])
    statMock.mockRejectedValue(new Error('directories should not be stat-ed during listing'))

    const { LocalSource } = await import('./local-source')
    const source = new LocalSource()

    await expect(source.list('/library')).resolves.toEqual([
      {
        name: 'Books',
        path: 'Books',
        isDirectory: true,
        size: 0,
        mtime: 0,
      },
    ])
    expect(statMock).not.toHaveBeenCalled()
  })

  it('still reads file metadata for file entries', async () => {
    readdirMock.mockResolvedValue([createDirent('novel.epub', 'file')])
    statMock.mockResolvedValue({
      isDirectory: () => false,
      size: 1234,
      mtimeMs: 5678,
    })

    const { LocalSource } = await import('./local-source')
    const source = new LocalSource()

    await expect(source.list('/library')).resolves.toEqual([
      {
        name: 'novel.epub',
        path: 'novel.epub',
        isDirectory: false,
        size: 1234,
        mtime: 5678,
      },
    ])
    expect(statMock).toHaveBeenCalledWith('/library/novel.epub')
  })

  it('recursively scans subdirectories without stat calls for directories', async () => {
    readdirMock.mockImplementation(async (dirPath: string) => {
      if (dirPath === '/library') {
        return [createDirent('Books', 'dir')]
      }
      if (dirPath === '/library/Books') {
        return [createDirent('novel.epub', 'file')]
      }
      return []
    })
    statMock.mockResolvedValue({
      isDirectory: () => false,
      size: 4321,
      mtimeMs: 8765,
    })

    const { LocalSource } = await import('./local-source')
    const source = new LocalSource()

    await expect(source.readDir('/library')).resolves.toEqual([
      {
        name: 'Books',
        path: 'Books',
        isDirectory: true,
        size: 0,
        mtime: 0,
      },
      {
        name: 'novel.epub',
        path: 'Books/novel.epub',
        isDirectory: false,
        size: 4321,
        mtime: 8765,
      },
    ])
    expect(statMock).toHaveBeenCalledTimes(1)
    expect(statMock).toHaveBeenCalledWith('/library/Books/novel.epub')
  })
})