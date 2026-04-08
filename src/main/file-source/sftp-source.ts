import type { NodeSSH, SFTPWrapper } from 'node-ssh'
import type { FileEntry } from '@shared/types'
import type { FileSource } from './types'
import { posix } from 'path'
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
        const entries: FileEntry[] = list.map((item) => ({
          name: item.filename,
          path: item.filename,
          isDirectory: (item.attrs.mode & 0o40000) !== 0,
          size: item.attrs.size,
          mtime: item.attrs.mtime * 1000,
        }))
        resolve(entries)
      })
    })
  }

  async stat(filePath: string): Promise<FileEntry> {
    const sftp = await this.getSftp()
    return new Promise((resolve, reject) => {
      sftp.stat(filePath, (err, stats) => {
        if (err) return reject(err)
        resolve({
          name: posix.basename(filePath),
          path: filePath,
          isDirectory: (stats.mode & 0o40000) !== 0,
          size: stats.size,
          mtime: stats.mtime * 1000,
        })
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
    const sftp = await this.getSftp()
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const stream = sftp.createReadStream(filePath, { encoding: 'utf8' })
      stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      stream.on('error', reject)
    })
  }

  async writeText(filePath: string, content: string): Promise<void> {
    const sftp = await this.getSftp()
    return new Promise((resolve, reject) => {
      const stream = sftp.createWriteStream(filePath)
      stream.on('close', () => resolve())
      stream.on('error', reject)
      stream.end(content, 'utf-8')
    })
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
