import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { IPC_CHANNELS } from '@shared/types'
import type { CompareRequest, SourceConfig, SSHConfigInput } from '@shared/types'
import { createFileSource } from '../file-source/index'
import { compareDirectories } from '../compare/comparator'
import { computeTextDiff } from '@shared/text-diff'
import { wrapHandler } from '../utils/error'
import { logger } from '../utils/logger'
import * as configStore from '../ssh/config-store'
import { connectionManager } from '../ssh/connection-manager'
import { getConfigInternal } from '../ssh/config-store'
import * as historyStore from '../history/history-store'

let activeCompare:
  | {
      compareId: string
      controller: AbortController
    }
  | null = null

function registerFileHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FILE_SOURCE_LIST, (_event, sourceConfig: SourceConfig, dirPath: string) =>
    wrapHandler(async () => {
      const source = await createFileSource(sourceConfig)
      try {
        return await source.list(dirPath)
      } finally {
        await source.dispose()
      }
    }),
  )

  ipcMain.handle(IPC_CHANNELS.FILE_READ_TEXT, (_event, sourceConfig: SourceConfig, filePath: string) =>
    wrapHandler(async () => {
      const source = await createFileSource(sourceConfig)
      try {
        return await source.readText(filePath)
      } finally {
        await source.dispose()
      }
    }),
  )

  ipcMain.handle(IPC_CHANNELS.FILE_WRITE_TEXT, (_event, sourceConfig: SourceConfig, filePath: string, content: string) =>
    wrapHandler(async () => {
      const source = await createFileSource(sourceConfig)
      try {
        await source.writeText(filePath, content)
      } finally {
        await source.dispose()
      }
    }),
  )
}

function registerCompareHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.COMPARE_RUN, (event, request: CompareRequest) =>
    wrapHandler(async () => {
      activeCompare?.controller.abort()

      const controller = new AbortController()
      activeCompare = { compareId: request.compareId, controller }

      logger.info(`开始对比: 左=${request.left.type === 'sftp' ? 'SFTP' : '本地'}(${request.left.path}) 右=${request.right.type === 'sftp' ? 'SFTP' : '本地'}(${request.right.path})`)

      logger.info('正在创建左侧数据源...')
      const leftSource = await createFileSource(request.left)
      logger.info('左侧数据源就绪')

      logger.info('正在创建右侧数据源...')
      const rightSource = await createFileSource(request.right)
      logger.info('右侧数据源就绪')

      try {
        logger.info('开始逐层对比目录...')
        const result = await compareDirectories({
          leftSource,
          rightSource,
          leftRoot: request.left.path,
          rightRoot: request.right.path,
          strategies: request.strategies,
          extensionFilter: request.extensionFilter,
          signal: controller.signal,
          onEntriesFound: (entries) => {
            if (controller.signal.aborted) return
            logger.info(`发现新条目: ${entries.length} 项`)
            event.sender.send(IPC_CHANNELS.COMPARE_SCAN_COMPLETE, request.compareId, entries)
          },
          onEntryUpdate: (entry) => {
            if (controller.signal.aborted) return
            event.sender.send(IPC_CHANNELS.COMPARE_ENTRY_UPDATE, request.compareId, entry)
          },
        })

        logger.info(`对比完成，耗时 ${result.duration}ms — 相同:${result.stats.equal} 不同:${result.stats.different} 仅左:${result.stats.leftOnly} 仅右:${result.stats.rightOnly}`)

        // Attach source info for history
        const enriched = { ...result, leftSource: request.left, rightSource: request.right }
        historyStore.addHistory(enriched)
        return enriched
      } catch (error) {
        if (controller.signal.aborted) {
          logger.info('对比已取消')
        }
        throw error
      } finally {
        await leftSource.dispose()
        await rightSource.dispose()
        if (activeCompare?.compareId === request.compareId) {
          activeCompare = null
        }
      }
    }),
  )

  ipcMain.handle(IPC_CHANNELS.COMPARE_CANCEL, () =>
    wrapHandler(async () => {
      if (activeCompare) {
        activeCompare.controller.abort()
      }
    }),
  )

  ipcMain.handle(IPC_CHANNELS.TEXT_DIFF, (_event, leftText: string, rightText: string) =>
    wrapHandler(async () => {
      return computeTextDiff(leftText, rightText)
    }),
  )
}

function registerSSHHandlers(): void {
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
      const source = await createFileSource({ type: 'sftp', configId, path: dirPath })
      try {
        return await source.list(dirPath)
      } finally {
        await source.dispose()
      }
    }),
  )
}

function registerHistoryHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.HISTORY_LIST, () =>
    wrapHandler(async () => historyStore.listHistory()),
  )

  ipcMain.handle(IPC_CHANNELS.HISTORY_CLEAR, () =>
    wrapHandler(async () => historyStore.clearHistory()),
  )

  ipcMain.handle(IPC_CHANNELS.HISTORY_DELETE, (_event, id: string) =>
    wrapHandler(async () => historyStore.deleteHistory(id)),
  )
}

function registerDialogHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FOLDER, async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false, error: 'No focused window' }

    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, data: null }
    }
    return { success: true, data: result.filePaths[0] }
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FILE, async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false, error: 'No focused window' }

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'SSH Key', extensions: ['pem', 'key', 'pub', ''] }],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, data: null }
    }
    return { success: true, data: result.filePaths[0] }
  })
}

function registerFileOperationHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FILE_SHOW_IN_FOLDER, (_event, filePath: string) =>
    wrapHandler(async () => {
      shell.showItemInFolder(filePath)
    }),
  )

  ipcMain.handle(IPC_CHANNELS.FILE_RENAME, (_event, oldPath: string, newName: string) =>
    wrapHandler(async () => {
      const dir = path.dirname(oldPath)
      const newPath = path.join(dir, newName)
      await fs.rename(oldPath, newPath)
    }),
  )

  ipcMain.handle(IPC_CHANNELS.FILE_DELETE, (_event, filePath: string, isDirectory: boolean) =>
    wrapHandler(async () => {
      if (isDirectory) {
        await fs.rm(filePath, { recursive: true })
      } else {
        await fs.unlink(filePath)
      }
    }),
  )
}

export function registerAllHandlers(): void {
  registerFileHandlers()
  registerCompareHandlers()
  registerSSHHandlers()
  registerHistoryHandlers()
  registerDialogHandlers()
  registerFileOperationHandlers()
}
