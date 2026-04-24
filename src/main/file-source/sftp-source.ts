import type { NodeSSH } from 'node-ssh'
import type { FileEntryWithStats, SFTPWrapper, Stats } from 'ssh2'
import type { FileEntry } from '@shared/types'
import type { FileSource } from './types'
import { posix } from 'path'
import { createHash } from 'crypto'
import { logger } from '../utils/logger'

const sftpLogger = logger.child('ssh')
const RETRYABLE_SFTP_ERROR_PATTERNS = [
  /no response from server/i,
  /not connected/i,
  /channel closed/i,
  /connection.*lost/i,
  /connection ended unexpectedly/i,
  /timed out/i,
  /operation timed out after/i,
]

const DEFAULT_SFTP_OP_TIMEOUT_MS = 20_000
const SFTP_STREAM_OP_TIMEOUT_MS = 60_000

export interface SFTPSourceOptions {
  /** Called when the SFTP layer decides the underlying SSH connection is dead. */
  readonly onConnectionLost?: () => void
  readonly opTimeoutMs?: number
}

export class SFTPSource implements FileSource {
  readonly type = 'sftp' as const
  private sftp: SFTPWrapper | null = null
  private readonly onConnectionLost?: () => void
  private readonly opTimeoutMs: number

  constructor(private readonly ssh: NodeSSH, options: SFTPSourceOptions = {}) {
    this.onConnectionLost = options.onConnectionLost
    this.opTimeoutMs = options.opTimeoutMs ?? DEFAULT_SFTP_OP_TIMEOUT_MS
  }

  private async getSftp(): Promise<SFTPWrapper> {
    if (!this.sftp) {
      this.sftp = await this.ssh.requestSFTP()
    }
    return this.sftp
  }

  private resetSftp(): void {
    this.sftp = null
  }

  private async withSftpRetry<T>(
    operationLabel: string,
    operation: (sftp: SFTPWrapper) => Promise<T>,
    timeoutMs: number = this.opTimeoutMs,
  ): Promise<T> {
    let lastError: unknown = null

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sftp = await this.getSftp()

      try {
        return await withTimeout(operation(sftp), timeoutMs, operationLabel)
      } catch (error) {
        lastError = error
        const message = getSftpErrorMessage(error)

        if (attempt === 0 && isRetryableSftpError(error)) {
          sftpLogger.warn(`[SFTP] ${operationLabel} 失败，正在重建通道后重试: ${message}`)
          this.resetSftp()
          continue
        }

        if (isRetryableSftpError(error)) {
          sftpLogger.error(`[SFTP] ${operationLabel} 重试后仍失败，将丢弃 SSH 连接以便下次重连: ${message}`)
          this.resetSftp()
          try {
            this.ssh.dispose()
          } catch {
            // ignore
          }
          this.onConnectionLost?.()
        } else {
          sftpLogger.error(`[SFTP] ${operationLabel} 失败: ${message}`)
        }

        throw error
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  async list(dirPath: string): Promise<readonly FileEntry[]> {
    return this.withSftpRetry(`列出目录 ${dirPath}`, async (sftp) => {
      return new Promise((resolve, reject) => {
        sftp.readdir(dirPath, async (err, list) => {
          if (err) return reject(err)

          try {
            const entries = await Promise.all(list.map((item) => resolveSftpListEntry(dirPath, item, sftp)))
            resolve(entries)
          } catch (error) {
            reject(error)
          }
        })
      })
    })
  }

  async stat(filePath: string): Promise<FileEntry> {
    return this.withSftpRetry(`获取属性 ${filePath}`, async (sftp) => {
      return new Promise((resolve, reject) => {
        sftp.stat(filePath, (err, stats) => {
          if (err) return reject(err)
          resolve(mapSftpStats(filePath, stats))
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
    return this.withSftpRetry(`检查路径 ${path}`, async (sftp) => {
      return new Promise((resolve) => {
        sftp.stat(path, (err) => {
          resolve(!err)
        })
      })
    })
  }

  async readText(filePath: string): Promise<string> {
    const content = await this.readFileBuffer(filePath)
    return content.toString('utf-8')
  }

  async readFileBuffer(filePath: string): Promise<Buffer> {
    return this.withSftpRetry(`读取文件 ${filePath}`, async (sftp) => {
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = []
        const stream = sftp.createReadStream(filePath)
        stream.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)))
        stream.on('end', () => resolve(Buffer.concat(chunks)))
        stream.on('error', reject)
      })
    }, SFTP_STREAM_OP_TIMEOUT_MS)
  }

  async hashFile(filePath: string): Promise<string> {
    return this.withSftpRetry(`计算哈希 ${filePath}`, async (sftp) => {
      const hash = createHash('sha1')

      await new Promise<void>((resolve, reject) => {
        const stream = sftp.createReadStream(filePath)
        stream.on('data', (chunk: Buffer | string) => hash.update(chunk))
        stream.on('end', () => resolve())
        stream.on('error', reject)
      })

      return hash.digest('hex')
    }, SFTP_STREAM_OP_TIMEOUT_MS)
  }

  async hashFileRange(filePath: string, start: number, endInclusive: number): Promise<string> {
    return this.withSftpRetry(`计算区间哈希 ${filePath}:${start}-${endInclusive}`, async (sftp) => {
      const hash = createHash('sha1')

      await new Promise<void>((resolve, reject) => {
        const stream = sftp.createReadStream(filePath, { start, end: endInclusive })
        stream.on('data', (chunk: Buffer | string) => hash.update(chunk))
        stream.on('end', () => resolve())
        stream.on('error', reject)
      })

      return hash.digest('hex')
    }, SFTP_STREAM_OP_TIMEOUT_MS)
  }

  async writeText(filePath: string, content: string): Promise<void> {
    await this.writeFileBuffer(filePath, Buffer.from(content, 'utf-8'))
  }

  async writeFileBuffer(filePath: string, content: Buffer): Promise<void> {
    return this.withSftpRetry(`写入文件 ${filePath}`, async (sftp) => {
      return new Promise((resolve, reject) => {
        const stream = sftp.createWriteStream(filePath)
        stream.on('close', () => resolve())
        stream.on('error', reject)
        stream.end(content)
      })
    }, SFTP_STREAM_OP_TIMEOUT_MS)
  }

  async ensureDir(dirPath: string): Promise<void> {
    await this.withSftpRetry(`确保目录 ${dirPath}`, async (sftp) => {
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

function getSftpErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (timeoutMs <= 0) return promise
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`SFTP 操作超时：${label} (operation timed out after ${timeoutMs}ms)`))
    }, timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function isRetryableSftpError(error: unknown): boolean {
  const message = getSftpErrorMessage(error)
  return RETRYABLE_SFTP_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

const SFTP_FILE_TYPE_MASK = 0o170000
const SFTP_DIRECTORY_MODE = 0o040000
const SFTP_SYMLINK_MODE = 0o120000

function isSftpDirectoryMode(mode: number | undefined): boolean {
  return ((mode ?? 0) & SFTP_FILE_TYPE_MASK) === SFTP_DIRECTORY_MODE
}

function isSftpSymlinkEntry(item: FileEntryWithStats): boolean {
  const mode = item.attrs.mode ?? 0
  return (mode & SFTP_FILE_TYPE_MASK) === SFTP_SYMLINK_MODE || item.longname.startsWith('l')
}

function statSftpPath(sftp: SFTPWrapper, filePath: string): Promise<Stats> {
  return new Promise((resolve, reject) => {
    sftp.stat(filePath, (err, stats) => {
      if (err) return reject(err)
      resolve(stats)
    })
  })
}

async function resolveSftpListEntry(dirPath: string, item: FileEntryWithStats, sftp: SFTPWrapper): Promise<FileEntry> {
  if (!isSftpSymlinkEntry(item)) {
    return mapSftpEntry(item)
  }

  const fullPath = posix.join(dirPath, item.filename)

  try {
    const stats = await statSftpPath(sftp, fullPath)
    return {
      name: item.filename,
      path: item.filename,
      isDirectory: isSftpDirectoryMode(stats.mode),
      size: stats.size,
      mtime: stats.mtime * 1000,
    }
  } catch (error) {
    sftpLogger.warn(`[SFTP] 解析软链接失败，按原始类型处理: ${fullPath} - ${getSftpErrorMessage(error)}`)
    return mapSftpEntry(item)
  }
}

function mapSftpEntry(item: FileEntryWithStats): FileEntry {
  return {
    name: item.filename,
    path: item.filename,
    isDirectory: isSftpDirectoryMode(item.attrs.mode),
    size: item.attrs.size,
    mtime: item.attrs.mtime * 1000,
  }
}

function mapSftpStats(filePath: string, stats: Stats): FileEntry {
  return {
    name: posix.basename(filePath),
    path: filePath,
    isDirectory: isSftpDirectoryMode(stats.mode),
    size: stats.size,
    mtime: stats.mtime * 1000,
  }
}
