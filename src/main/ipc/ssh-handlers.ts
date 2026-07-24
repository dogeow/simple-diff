import { ipcMain } from 'electron'
import type { SourceConfig, SSHConfigInput } from '@shared/types'
import { IPC_CHANNELS } from '@shared/types'
import { createFileSource } from '../file-source/index'
import { wrapHandler } from '../utils/error'
import * as configStore from '../ssh/config-store'
import { connectionManager } from '../ssh/connection-manager'
import { getConfigInternal } from '../ssh/config-store'
import { resolveAllowedSourcePath } from './path-guards'

export function registerSSHHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SSH_LIST_CONFIGS, () =>
    wrapHandler(async () => configStore.listConfigs()),
  )

  ipcMain.handle(IPC_CHANNELS.SSH_SAVE_CONFIG, (_event, input: SSHConfigInput) =>
    wrapHandler(async () => configStore.saveConfig(input)),
  )

  ipcMain.handle(IPC_CHANNELS.SSH_DELETE_CONFIG, (_event, id: string) =>
    wrapHandler(async () => {
      await connectionManager.disconnect(id)
      configStore.deleteConfig(id)
    }),
  )

  ipcMain.handle(IPC_CHANNELS.SSH_TEST, (_event, id: string) =>
    wrapHandler(async () => {
      const config = getConfigInternal(id)
      if (!config) throw new Error('SSH 配置未找到')
      return connectionManager.testConnection(config)
    }),
  )

  ipcMain.handle(IPC_CHANNELS.SSH_BROWSE, (_event, configId: string, dirPath: string) =>
    wrapHandler(async () => {
      const config = getConfigInternal(configId)
      if (!config) throw new Error('SSH 配置未找到')

      const defaultPath = config.defaultPath?.trim() || '/'
      const sourceConfig: SourceConfig = {
        type: 'sftp',
        configId,
        path: defaultPath,
      }

      const safePath = resolveAllowedSourcePath(sourceConfig, dirPath)
      const source = await createFileSource(sourceConfig)
      try {
        return await source.list(safePath)
      } finally {
        await source.dispose()
      }
    }),
  )
}
