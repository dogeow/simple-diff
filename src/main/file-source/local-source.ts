import { createReadStream, type Dirent } from 'fs'
import { readdir, stat as fsStat, access, readFile, writeFile } from 'fs/promises'
import { join, relative, basename } from 'path'
import { createHash } from 'crypto'
import type { FileEntry } from '@shared/types'
import type { FileSource } from './types'
import { logger } from '../utils/logger'

export class LocalSource implements FileSource {
  readonly type = 'local' as const

  async list(dirPath: string): Promise<readonly FileEntry[]> {
    const entries = await readdir(dirPath, { withFileTypes: true })
    const results: FileEntry[] = []

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      try {
        const stats = await fsStat(fullPath)
        results.push({
          name: entry.name,
          path: entry.name,
          isDirectory: entry.isDirectory(),
          size: stats.size,
          mtime: stats.mtimeMs,
        })
      } catch {
        // skip entries we can't stat (permission errors, etc.)
      }
    }

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

  async dispose(): Promise<void> {
    // no-op for local
  }

  private async walkDir(rootPath: string, currentPath: string, results: FileEntry[]): Promise<void> {
    const rel = relative(rootPath, currentPath) || '.'
    logger.info(`[本地] 扫描目录: ${rel}  (已发现 ${results.length} 项)`)
    let entries: Dirent<string>[]
    try {
      entries = await readdir(currentPath, { withFileTypes: true, encoding: 'utf8' })
    } catch (err) {
      logger.warn(`[本地] 无法读取目录: ${rel} - ${err instanceof Error ? err.message : err}`)
      return // skip unreadable directories
    }

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name)
      const relativePath = relative(rootPath, fullPath)

      try {
        const stats = await fsStat(fullPath)
        results.push({
          name: entry.name,
          path: relativePath,
          isDirectory: entry.isDirectory(),
          size: stats.size,
          mtime: stats.mtimeMs,
        })

        if (entry.isDirectory()) {
          await this.walkDir(rootPath, fullPath, results)
        }
      } catch {
        // skip entries we can't stat
      }
    }
  }
}
