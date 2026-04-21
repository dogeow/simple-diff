import type { NodeSSH } from 'node-ssh'
import type { FileEntryWithStats, SFTPWrapper, Stats } from 'ssh2'
import type { FileEntry } from '@shared/types'
import type { FileSource } from './types'
import { posix } from 'path'
import { createHash } from 'crypto'
import { logger } from '../utils/logger'

export class SFTPSource implements FileSource {
  readonly type = 'sftp' as const
  private sftp: SFTPWrapper | null = null

  constructor(private readonly ssh: NodeSSH) {}

  private async getSftp(): Promise<SFTPWrapper> {
    if (!this.sftp) {
      this.sftp = await this.ssh.requestSFTP()
    }
    return this.sftp
  }

  async list(dirPath: string): Promise<readonly FileEntry[]> {
    const sftp = await this.getSftp()
    return new Promise((resolve, reject) => {
      sftp.readdir(dirPath, (err, list) => {
        if (err) return reject(err)
        resolve(list.map(mapSftpEntry))
      })
    })
  }

  async stat(filePath: string): Promise<FileEntry> {
    const sftp = await this.getSftp()
    return new Promise((resolve, reject) => {
      sftp.stat(filePath, (err, stats) => {
        if (err) return reject(err)
        resolve(mapSftpStats(filePath, stats))
      })
    })
  }

  async readDir(dirPath: string): Promise<readonly FileEntry[]> {
    const results: FileEntry[] = []
    await this.walkDir(dirPath, dirPath, results)
    return results
  }

  async exists(path: string): Promise<boolean> {
    const sftp = await this.getSftp()
    return new Promise((resolve) => {
      sftp.stat(path, (err) => {
        resolve(!err)
      })
    })
  }

  async readText(filePath: string): Promise<string> {
    const content = await this.readFileBuffer(filePath)
    return content.toString('utf-8')
  }

  async readFileBuffer(filePath: string): Promise<Buffer> {
    const sftp = await this.getSftp()
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const stream = sftp.createReadStream(filePath)
      stream.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })
  }

  async hashFile(filePath: string): Promise<string> {
    const sftp = await this.getSftp()
    const hash = createHash('sha1')

    await new Promise<void>((resolve, reject) => {
      const stream = sftp.createReadStream(filePath)
      stream.on('data', (chunk: Buffer | string) => hash.update(chunk))
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })

    return hash.digest('hex')
  }

  async hashFileRange(filePath: string, start: number, endInclusive: number): Promise<string> {
    const sftp = await this.getSftp()
    const hash = createHash('sha1')

    await new Promise<void>((resolve, reject) => {
      const stream = sftp.createReadStream(filePath, { start, end: endInclusive })
      stream.on('data', (chunk: Buffer | string) => hash.update(chunk))
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })

    return hash.digest('hex')
  }

  async writeText(filePath: string, content: string): Promise<void> {
    await this.writeFileBuffer(filePath, Buffer.from(content, 'utf-8'))
  }

  async writeFileBuffer(filePath: string, content: Buffer): Promise<void> {
    const sftp = await this.getSftp()
    return new Promise((resolve, reject) => {
      const stream = sftp.createWriteStream(filePath)
      stream.on('close', () => resolve())
      stream.on('error', reject)
      stream.end(content)
    })
  }

  async ensureDir(dirPath: string): Promise<void> {
    const sftp = await this.getSftp()
    const normalized = posix.normalize(dirPath)
    const segments = normalized.split('/').filter(Boolean)
    let current = normalized.startsWith('/') ? '/' : ''

    for (const segment of segments) {
      current = current === '/' ? `/${segment}` : (current ? `${current}/${segment}` : segment)
      // eslint-disable-next-line no-await-in-loop
      const exists = await new Promise<boolean>((resolve) => {
        sftp.stat(current, (err) => resolve(!err))
      })
      if (exists) continue
      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve, reject) => {
        sftp.mkdir(current, (err) => {
          if (!err) return resolve()
          if (String(err).includes('Failure')) return resolve()
          reject(err)
        })
      })
    }
  }

  async dispose(): Promise<void> {
    this.sftp = null
    // Don't close SSH here — ConnectionManager owns the connection
  }

  private async walkDir(rootPath: string, currentPath: string, results: FileEntry[]): Promise<void> {
    const rel = posix.relative(rootPath, currentPath) || '.'
    logger.info(`[SFTP] 扫描目录: ${rel}  (已发现 ${results.length} 项)`)
    let list: FileEntry[]
    try {
      list = [...(await this.list(currentPath))]
    } catch (err) {
      logger.warn(`[SFTP] 无法读取目录: ${rel} - ${err instanceof Error ? err.message : err}`)
      return
    }

    for (const entry of list) {
      const fullPath = posix.join(currentPath, entry.name)
      const relativePath = posix.relative(rootPath, fullPath)

      results.push({
        ...entry,
        path: relativePath,
      })

      if (entry.isDirectory) {
        await this.walkDir(rootPath, fullPath, results)
      }
    }
  }
}

function mapSftpEntry(item: FileEntryWithStats): FileEntry {
  return {
    name: item.filename,
    path: item.filename,
    isDirectory: ((item.attrs.mode ?? 0) & 0o40000) !== 0,
    size: item.attrs.size,
    mtime: item.attrs.mtime * 1000,
  }
}

function mapSftpStats(filePath: string, stats: Stats): FileEntry {
  return {
    name: posix.basename(filePath),
    path: filePath,
    isDirectory: ((stats.mode ?? 0) & 0o40000) !== 0,
    size: stats.size,
    mtime: stats.mtime * 1000,
  }
}
