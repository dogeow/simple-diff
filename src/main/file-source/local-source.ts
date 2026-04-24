import { createReadStream, type Dirent } from 'fs'
import { mkdir, readdir, stat as fsStat, access, readFile, writeFile } from 'fs/promises'
import { join, relative, basename } from 'path'
import { createHash } from 'crypto'
import type { FileEntry } from '@shared/types'
import type { FileSource } from './types'
import { logger } from '../utils/logger'

export class LocalSource implements FileSource {
  readonly type = 'local' as const

  async list(dirPath: string): Promise<readonly FileEntry[]> {
    const entries = await readdir(dirPath, { withFileTypes: true })
    const results = await mapConcurrent(entries, 64, async (entry) => {
      const fullPath = join(dirPath, entry.name)
      try {
        const stats = await fsStat(fullPath)
        return {
          name: entry.name,
          path: entry.name,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          mtime: stats.mtimeMs,
        }
      } catch {
        // skip entries we can't stat (permission errors, etc.)
        return null
      }
    })

    return results
  }

  async stat(filePath: string): Promise<FileEntry> {
    const stats = await fsStat(filePath)
    return {
      name: basename(filePath),
      path: filePath,
      isDirectory: stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtimeMs,
    }
  }

  async readDir(dirPath: string): Promise<readonly FileEntry[]> {
    const results: FileEntry[] = []
    await this.walkDir(dirPath, dirPath, results)
    return results
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  }

  async readText(filePath: string): Promise<string> {
    return readFile(filePath, 'utf-8')
  }

  async readFileBuffer(filePath: string): Promise<Buffer> {
    return readFile(filePath)
  }

  async hashFile(filePath: string): Promise<string> {
    const hash = createHash('sha1')

    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })

    return hash.digest('hex')
  }

  async hashFileRange(filePath: string, start: number, endInclusive: number): Promise<string> {
    const hash = createHash('sha1')

    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath, { start, end: endInclusive })
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })

    return hash.digest('hex')
  }

  async writeText(filePath: string, content: string): Promise<void> {
    await writeFile(filePath, content, 'utf-8')
  }

  async writeFileBuffer(filePath: string, content: Buffer): Promise<void> {
    await writeFile(filePath, content)
  }

  async ensureDir(dirPath: string): Promise<void> {
    await mkdir(dirPath, { recursive: true })
  }

  async dispose(): Promise<void> {
    // no-op for local
  }

  private async walkDir(rootPath: string, currentPath: string, results: FileEntry[]): Promise<void> {
    let entries: Dirent<string>[]
    try {
      entries = await readdir(currentPath, { withFileTypes: true, encoding: 'utf8' })
    } catch (err) {
      logger.warn(`[本地] 无法读取目录: ${rel} - ${err instanceof Error ? err.message : err}`)
      return // skip unreadable directories
    }

    const children = await mapConcurrent(entries, 64, async (entry) => {
      const fullPath = join(currentPath, entry.name)
      const relativePath = relative(rootPath, fullPath)

      try {
        const stats = await fsStat(fullPath)
        return {
          name: entry.name,
          path: relativePath,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          mtime: stats.mtimeMs,
        }
      } catch {
        // skip entries we can't stat
        return null
      }
    })

    for (const child of children) {
      results.push(child)
      if (child.isDirectory) {
        await this.walkDir(rootPath, join(rootPath, child.path), results)
      }
    }
  }
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R | null>,
): Promise<R[]> {
  if (items.length === 0) return []

  const results: Array<R | null> = new Array(items.length).fill(null)
  let nextIndex = 0
  const workerCount = Math.min(concurrency, items.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++
      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  }))

  return results.filter((item): item is R => item != null)
}
