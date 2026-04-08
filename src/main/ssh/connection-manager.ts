import { NodeSSH } from 'node-ssh'
import type { SSHConfigInternal } from '@shared/types'
import { readFile, access } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { logger } from '../utils/logger'

const DEFAULT_KEY_PATHS = [
  'id_ed25519',
  'id_rsa',
  'id_ecdsa',
]

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return join(homedir(), p.slice(1))
  }
  return p
}

async function findDefaultKey(): Promise<string | null> {
  const sshDir = join(homedir(), '.ssh')
  for (const name of DEFAULT_KEY_PATHS) {
    const keyPath = join(sshDir, name)
    try {
      await access(keyPath)
      return keyPath
    } catch {
      // continue
    }
  }
  return null
}

export class ConnectionManager {
  private readonly connections = new Map<string, NodeSSH>()

  async connect(config: SSHConfigInternal): Promise<NodeSSH> {
    const existing = this.connections.get(config.id)
    if (existing?.isConnected()) {
      logger.info(`SSH 复用已有连接: ${config.host}:${config.port}`)
      return existing
    }

    logger.info(`SSH 正在连接: ${config.username}@${config.host}:${config.port}`)
    const ssh = new NodeSSH()
    const connectConfig: Record<string, unknown> = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 10000,
    }

    if (config.authType === 'password') {
      connectConfig.password = config.password
    } else if (config.authType === 'privateKey') {
      let keyPath = config.privateKeyPath ? expandHome(config.privateKeyPath) : null
      if (!keyPath) {
        keyPath = await findDefaultKey()
      }
      if (keyPath) {
        const keyContent = await readFile(keyPath, 'utf-8')
        connectConfig.privateKey = keyContent
        if (config.passphrase) {
          connectConfig.passphrase = config.passphrase
        }
      }
      // Fallback: try SSH agent
      if (!keyPath && process.env.SSH_AUTH_SOCK) {
        connectConfig.agent = process.env.SSH_AUTH_SOCK
      }
    }

    await ssh.connect(connectConfig)
    logger.info(`SSH 连接成功: ${config.host}:${config.port}`)
    this.connections.set(config.id, ssh)
    return ssh
  }

  async disconnect(configId: string): Promise<void> {
    const ssh = this.connections.get(configId)
    if (ssh) {
      ssh.dispose()
      this.connections.delete(configId)
    }
  }

  async testConnection(config: SSHConfigInternal): Promise<boolean> {
    const ssh = new NodeSSH()
    try {
      const connectConfig: Record<string, unknown> = {
        host: config.host,
        port: config.port,
        username: config.username,
        readyTimeout: 10000,
      }

      if (config.authType === 'password') {
        connectConfig.password = config.password
      } else if (config.authType === 'privateKey') {
        let keyPath = config.privateKeyPath ? expandHome(config.privateKeyPath) : null
        if (!keyPath) {
          keyPath = await findDefaultKey()
        }
        if (keyPath) {
          const keyContent = await readFile(keyPath, 'utf-8')
          connectConfig.privateKey = keyContent
          if (config.passphrase) {
            connectConfig.passphrase = config.passphrase
          }
        }
        if (!keyPath && process.env.SSH_AUTH_SOCK) {
          connectConfig.agent = process.env.SSH_AUTH_SOCK
        }
      }

      await ssh.connect(connectConfig)
      ssh.dispose()
      return true
    } catch {
      ssh.dispose()
      return false
    }
  }

  getConnection(configId: string): NodeSSH | undefined {
    const ssh = this.connections.get(configId)
    return ssh?.isConnected() ? ssh : undefined
  }

  async disposeAll(): Promise<void> {
    for (const [id, ssh] of this.connections) {
      ssh.dispose()
    }
    this.connections.clear()
  }
}

export const connectionManager = new ConnectionManager()
