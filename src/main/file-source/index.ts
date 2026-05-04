import type { SourceConfig } from '@shared/types'
import type { FileSource } from './types'
import { LocalSource } from './local-source'
import { SFTPSource } from './sftp-source'
import { connectionManager } from '../ssh/connection-manager'
import { getConfigInternal } from '../ssh/config-store'
import { logger } from '../utils/logger'

const sshLogger = logger.child('ssh')

export type { FileSource } from './types'
export { LocalSource } from './local-source'
export { SFTPSource } from './sftp-source'

export interface CreateFileSourceOptions {
  readonly connectionMode?: 'shared' | 'isolated'
}

export async function createFileSource(config: SourceConfig, options: CreateFileSourceOptions = {}): Promise<FileSource> {
  switch (config.type) {
    case 'local':
      return new LocalSource()
    case 'sftp': {
      const sshConfig = getConfigInternal(config.configId)
      if (!sshConfig) {
        sshLogger.error(`SSH 配置未找到: ${config.configId}`)
        throw new Error(`SSH config not found: ${config.configId}`)
      }
      const connectionMode = options.connectionMode ?? 'shared'
      sshLogger.info(`SFTP 正在连接: ${sshConfig.host}:${sshConfig.port}`)
      const ssh = connectionMode === 'isolated'
        ? await connectionManager.connectIsolated(sshConfig)
        : await connectionManager.connect(sshConfig)
      sshLogger.info(`SFTP 连接就绪: ${sshConfig.host}`)
      return new SFTPSource(ssh, {
        onConnectionLost: connectionMode === 'shared'
          ? () => connectionManager.invalidate(sshConfig.id)
          : undefined,
        disposeSshOnClose: connectionMode === 'isolated',
      })
    }
  }
}
