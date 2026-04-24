import { describe, expect, it, vi } from 'vitest'
import type { NodeSSH } from 'node-ssh'
import type { FileEntryWithStats, SFTPWrapper } from 'ssh2'
import { SFTPSource } from './sftp-source'

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

function createSftpEntry(filename: string, isDirectory = false): FileEntryWithStats {
  return {
    filename,
    longname: filename,
    attrs: {
      mode: isDirectory ? 0o040755 : 0o100644,
      uid: 0,
      gid: 0,
      size: isDirectory ? 0 : 1,
      atime: 1,
      mtime: 1,
    },
  }
}

describe('SFTPSource', () => {
  it('treats a symlinked directory as a directory when listing entries', async () => {
    const sftp = {
      readdir: vi.fn((dirPath: string, callback: (err: Error | null, list?: FileEntryWithStats[]) => void) => {
        expect(dirPath).toBe('/var/www')
        callback(null, [{
          filename: 'current',
          longname: 'lrwxrwxrwx 1 deploy deploy 30 Apr 24 20:00 current -> releases/20260424',
          attrs: {
            mode: 0o120777,
            uid: 0,
            gid: 0,
            size: 30,
            atime: 1,
            mtime: 1,
          },
        }])
      }),
      stat: vi.fn((filePath: string, callback: (err: Error | null, stats?: { mode: number, size: number, mtime: number }) => void) => {
        expect(filePath).toBe('/var/www/current')
        callback(null, {
          mode: 0o040755,
          size: 4096,
          mtime: 2,
        })
      }),
    } as unknown as SFTPWrapper

    const ssh = {
      requestSFTP: vi.fn().mockResolvedValue(sftp),
    } as unknown as NodeSSH

    const source = new SFTPSource(ssh)

    await expect(source.list('/var/www')).resolves.toEqual([
      {
        name: 'current',
        path: 'current',
        isDirectory: true,
        size: 4096,
        mtime: 2000,
      },
    ])
  })

  it('recreates the SFTP channel and retries list when the server stops responding', async () => {
    const firstSftp = {
      readdir: vi.fn((dirPath: string, callback: (err: Error | null, list?: FileEntryWithStats[]) => void) => {
        expect(dirPath).toBe('/var/www')
        callback(new Error('No response from server'))
      }),
    } as unknown as SFTPWrapper

    const secondSftp = {
      readdir: vi.fn((dirPath: string, callback: (err: Error | null, list?: FileEntryWithStats[]) => void) => {
        expect(dirPath).toBe('/var/www')
        callback(null, [createSftpEntry('deploy.php')])
      }),
    } as unknown as SFTPWrapper

    const ssh = {
      requestSFTP: vi.fn()
        .mockResolvedValueOnce(firstSftp)
        .mockResolvedValueOnce(secondSftp),
    } as unknown as NodeSSH

    const source = new SFTPSource(ssh)

    await expect(source.list('/var/www')).resolves.toEqual([
      {
        name: 'deploy.php',
        path: 'deploy.php',
        isDirectory: false,
        size: 1,
        mtime: 1000,
      },
    ])

    expect(ssh.requestSFTP).toHaveBeenCalledTimes(2)
  })

  it('treats a never-resolving readdir as a transport error and retries with a fresh channel', async () => {
    const hangingSftp = {
      readdir: vi.fn(() => {
        // never invokes the callback — simulates a half-open SFTP channel
      }),
    } as unknown as SFTPWrapper

    const recoveredSftp = {
      readdir: vi.fn((dirPath: string, callback: (err: Error | null, list?: FileEntryWithStats[]) => void) => {
        expect(dirPath).toBe('/srv')
        callback(null, [createSftpEntry('app', true)])
      }),
    } as unknown as SFTPWrapper

    const dispose = vi.fn()
    const ssh = {
      requestSFTP: vi.fn()
        .mockResolvedValueOnce(hangingSftp)
        .mockResolvedValueOnce(recoveredSftp),
      dispose,
    } as unknown as NodeSSH

    const onConnectionLost = vi.fn()
    const source = new SFTPSource(ssh, { onConnectionLost, opTimeoutMs: 50 })

    await expect(source.list('/srv')).resolves.toEqual([
      {
        name: 'app',
        path: 'app',
        isDirectory: true,
        size: 0,
        mtime: 1000,
      },
    ])

    expect(ssh.requestSFTP).toHaveBeenCalledTimes(2)
    expect(dispose).not.toHaveBeenCalled()
    expect(onConnectionLost).not.toHaveBeenCalled()
  })

  it('disposes the SSH connection and notifies when retry also hangs', async () => {
    const hangingSftp = {
      readdir: vi.fn(() => {
        // never invokes the callback
      }),
    } as unknown as SFTPWrapper

    const dispose = vi.fn()
    const ssh = {
      requestSFTP: vi.fn().mockResolvedValue(hangingSftp),
      dispose,
    } as unknown as NodeSSH

    const onConnectionLost = vi.fn()
    const source = new SFTPSource(ssh, { onConnectionLost, opTimeoutMs: 30 })

    await expect(source.list('/srv')).rejects.toThrow(/timed out|超时/)

    expect(ssh.requestSFTP).toHaveBeenCalledTimes(2)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(onConnectionLost).toHaveBeenCalledTimes(1)
  })
})