import { NodeSSH } from 'node-ssh'
import type { Config as NodeSSHConfig } from 'node-ssh'
import type { SSHConfigInternal } from '@shared/types'
import { readFile, access } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { logger } from '../utils/logger'

const sshLogger = logger.child('ssh')

const DEFAULT_KEY_PATHS = [
  'id_ed25519',
  'id_rsa',
  'id_ecdsa',
]

const SSH_READY_TIMEOUT_MS = 10000
const SSH_KEEPALIVE_INTERVAL_MS = 15000
const SSH_KEEPALIVE_COUNT_MAX = 3

const REDACTED = '[REDACTED]'

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

async function buildConnectConfig(config: SSHConfigInternal): Promise<NodeSSHConfig> {
  const base: NodeSSHConfig = {
    host: config.host,
    port: config.port,
    username: config.username,
    readyTimeout: SSH_READY_TIMEOUT_MS,
    keepaliveInterval: SSH_KEEPALIVE_INTERVAL_MS,
    keepaliveCountMax: SSH_KEEPALIVE_COUNT_MAX,
  }

  if (config.authType === 'password') {
    return { ...base, password: config.password }
  }

  const explicitKeyPath = config.privateKeyPath ? expandHome(config.privateKeyPath) : null
  const keyPath = explicitKeyPath ?? (await findDefaultKey())

  if (keyPath) {
    const privateKey = await readFile(keyPath, 'utf-8')
    return {
      ...base,
      privateKey,
      ...(config.passphrase ? { passphrase: config.passphrase } : {}),
    }
  }

  if (process.env.SSH_AUTH_SOCK) {
    return { ...base, agent: process.env.SSH_AUTH_SOCK }
  }

  return base
}

/** Returns a copy of the connect config with credentials redacted, safe for logging. */
function redactConnectConfig(config: NodeSSHConfig): Record<string, unknown> {
  const redacted: Record<string, unknown> = { ...config }
  if (redacted.password != null) redacted.password = REDACTED
  if (redacted.privateKey != null) redacted.privateKey = REDACTED
  if (redacted.passphrase != null) redacted.passphrase = REDACTED
  return redacted
}

export class ConnectionManager {
  private readonly connections = new Map<string, NodeSSH>()

  async connect(config: SSHConfigInternal): Promise<NodeSSH> {
    const existing = this.connections.get(config.id)
    if (existing?.isConnected()) {
      sshLogger.info(`SSH 复用已有连接: ${config.host}:${config.port}`)
      return existing
    }

    const ssh = await this.openConnection(config)
    this.connections.set(config.id, ssh)
    return ssh
  }

  async connectIsolated(config: SSHConfigInternal): Promise<NodeSSH> {
    return this.openConnection(config)
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
      const connectConfig = await buildConnectConfig(config)
      await ssh.connect(connectConfig)
      return true
    } catch {
      return false
    } finally {
      ssh.dispose()
    }
  }

  getConnection(configId: string): NodeSSH | undefined {
    const ssh = this.connections.get(configId)
    return ssh?.isConnected() ? ssh : undefined
  }

  /** Drop a cached connection without throwing; next connect() will reconnect. */
  invalidate(configId: string): void {
    const ssh = this.connections.get(configId)
    if (!ssh) return
    try {
      ssh.dispose()
    } catch {
      // ignore
    }
    this.connections.delete(configId)
    sshLogger.warn(`SSH 已主动断开缓存连接: ${configId}`)
  }

  async disposeAll(): Promise<void> {
    for (const [id, ssh] of this.connections) {
      ssh.dispose()
    }
    this.connections.clear()
  }

  private async openConnection(config: SSHConfigInternal): Promise<NodeSSH> {
    sshLogger.info(`SSH 正在连接: ${config.username}@${config.host}:${config.port}`)
    const ssh = new NodeSSH()
    const connectConfig = await buildConnectConfig(config)

    try {
      await ssh.connect(connectConfig)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const safeConfig = JSON.stringify(redactConnectConfig(connectConfig))
      sshLogger.error(`SSH 连接失败: ${config.host}:${config.port} - ${message} (config=${safeConfig})`)
      throw error
    }

    sshLogger.info(`SSH 连接成功: ${config.host}:${config.port}`)
    return ssh
  }
}

export const connectionManager = new ConnectionManager()
