import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { IPC_CHANNELS } from '@shared/types'
import type { CompareEntry, CompareRequest, SourceConfig, SSHConfigInput, StartSyncRequest } from '@shared/types'
import { formatDuration } from '@shared/format-duration'
import { createFileSource } from '../file-source/index'
import { compareDirectories } from '../compare/comparator'
import { computeTextDiff } from '@shared/text-diff'
import { wrapHandler } from '../utils/error'
import { logger } from '../utils/logger'
import { safeSendToWebContents, safeSendToWindow } from '../utils/safe-ipc'
import * as configStore from '../ssh/config-store'
import { connectionManager } from '../ssh/connection-manager'
import { getConfigInternal } from '../ssh/config-store'
import * as historyStore from '../history/history-store'
import { syncManager } from '../sync/sync-manager'

const compareLogger = logger.child('compare')
const ENTRY_UPDATE_FLUSH_INTERVAL_MS = 100
const ENTRY_UPDATE_FLUSH_THRESHOLD = 1000
const SCAN_BATCH_LOG_LIMIT = 20
const SCAN_BATCH_LOG_INTERVAL = 200
const ENTRY_UPDATE_LOG_LIMIT = 20
const ENTRY_UPDATE_LOG_INTERVAL = 5000

interface ActiveCompare {
  readonly compareId: string
  readonly controller: AbortController
}

const activeCompares = new WeakMap<object, Map<string, ActiveCompare>>()

function getActiveCompareMap(sender: object): Map<string, ActiveCompare> {
  let compares = activeCompares.get(sender)
  if (!compares) {
    compares = new Map<string, ActiveCompare>()
    activeCompares.set(sender, compares)
  }
  return compares
}

function setActiveCompare(sender: object, compare: ActiveCompare): void {
  const compares = getActiveCompareMap(sender)
  compares.set(compare.compareId, compare)
}

function getActiveCompare(sender: object, compareId: string): ActiveCompare | null {
  return activeCompares.get(sender)?.get(compareId) ?? null
}

function clearActiveCompare(sender: object, compareId: string, controller: AbortController): void {
  const compares = activeCompares.get(sender)
  const activeCompare = compares?.get(compareId)
  if (activeCompare?.controller === controller) {
    compares.delete(compareId)
  }
  if (compares && compares.size === 0) {
    activeCompares.delete(sender)
  }
}

function cancelActiveCompare(sender: object, compareId?: string): void {
  const compares = activeCompares.get(sender)
  if (!compares) return

  if (compareId) {
    compares.get(compareId)?.controller.abort()
    return
  }

  for (const compare of compares.values()) {
    compare.controller.abort()
  }
}

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
      getActiveCompare(event.sender, request.compareId)?.controller.abort()

      const controller = new AbortController()
      setActiveCompare(event.sender, { compareId: request.compareId, controller })

      const sender = event.sender
      const onSenderGone = (reason: string): void => {
        if (controller.signal.aborted) return
        compareLogger.warn(`[${request.compareId}] 渲染进程不再可用 (${reason})，取消对比`)
        controller.abort()
      }
      const onDestroyed = (): void => onSenderGone('destroyed')
      const onRenderProcessGone = (): void => onSenderGone('render-process-gone')
      sender.once('destroyed', onDestroyed)
      sender.once('render-process-gone', onRenderProcessGone)

      let scanBatchCount = 0
      let sentEntryUpdateCount = 0

      compareLogger.info(`[${request.compareId}] 开始对比: 左=${request.left.type === 'sftp' ? 'SFTP' : '本地'}(${request.left.path}) 右=${request.right.type === 'sftp' ? 'SFTP' : '本地'}(${request.right.path})`)

      compareLogger.info(`[${request.compareId}] 正在创建左侧数据源...`)
      const leftSource = await createFileSource(request.left)
      compareLogger.info(`[${request.compareId}] 左侧数据源就绪`)

      compareLogger.info(`[${request.compareId}] 正在创建右侧数据源...`)
      const rightSource = await createFileSource(request.right)
      compareLogger.info(`[${request.compareId}] 右侧数据源就绪`)

      const entryUpdateBuffer: CompareEntry[] = []
      let flushTimer: NodeJS.Timeout | null = null

      const abortForUnavailableRenderer = (phase: '扫描批次' | '条目更新'): void => {
        if (controller.signal.aborted) return
        compareLogger.warn(`[${request.compareId}] ${phase}无法发送到渲染进程，取消进行中的对比`)
        controller.abort()
      }

      const flushEntryUpdates = (): void => {
        if (flushTimer) {
          clearTimeout(flushTimer)
          flushTimer = null
        }
        if (entryUpdateBuffer.length === 0) return
        const batch = entryUpdateBuffer.splice(0, entryUpdateBuffer.length)
        const previousEntryUpdateCount = sentEntryUpdateCount
        sentEntryUpdateCount += batch.length
        if (previousEntryUpdateCount < ENTRY_UPDATE_LOG_LIMIT || Math.floor(previousEntryUpdateCount / ENTRY_UPDATE_LOG_INTERVAL) !== Math.floor(sentEntryUpdateCount / ENTRY_UPDATE_LOG_INTERVAL)) {
          compareLogger.info(
            `[${request.compareId}] 发送条目更新批次: size=${batch.length} 累计=${sentEntryUpdateCount} sample=${batch.slice(0, 3).map((e) => `${e.relativePath || '.'}@${e.state}`).join('、')}`,
          )
        }
        const sent = safeSendToWebContents(event.sender, IPC_CHANNELS.COMPARE_ENTRY_UPDATE, request.compareId, batch)
        if (!sent) {
          abortForUnavailableRenderer('条目更新')
        }
      }

      try {
        compareLogger.info(`[${request.compareId}] 开始逐层对比目录...`)
        const result = await compareDirectories({
          leftSource,
          rightSource,
          leftRoot: request.left.path,
          rightRoot: request.right.path,
          compareId: request.compareId,
          strategies: request.strategies,
          extensionFilter: request.extensionFilter,
          previousEntries: request.previousEntries,
          retainEntries: false,
          signal: controller.signal,
          onEntriesFound: (entries) => {
            if (controller.signal.aborted) return
            scanBatchCount += 1
            if (scanBatchCount <= SCAN_BATCH_LOG_LIMIT || scanBatchCount % SCAN_BATCH_LOG_INTERVAL === 0) {
              compareLogger.info(
                `[${request.compareId}] 发送扫描批次 #${scanBatchCount}: entries=${entries.length} sample=${entries.slice(0, 3).map((entry) => entry.relativePath).join('、') || '.'}`,
              )
            }
            const sent = safeSendToWebContents(event.sender, IPC_CHANNELS.COMPARE_SCAN_COMPLETE, request.compareId, entries)
            if (!sent) {
              abortForUnavailableRenderer('扫描批次')
            }
          },
          onEntryUpdate: (entry) => {
            entryUpdateBuffer.push(entry)
            if (entryUpdateBuffer.length >= ENTRY_UPDATE_FLUSH_THRESHOLD) {
              flushEntryUpdates()
              return
            }
            if (!flushTimer) {
              flushTimer = setTimeout(flushEntryUpdates, ENTRY_UPDATE_FLUSH_INTERVAL_MS)
            }
          },
        })

        flushEntryUpdates()
        compareLogger.info(`[${request.compareId}] 对比完成，耗时 ${formatDuration(result.duration)} — 相同:${result.stats.equal} 不同:${result.stats.different} 仅左:${result.stats.leftOnly} 仅右:${result.stats.rightOnly}`)

        // Attach source info for history
        const enriched = { ...result, leftSource: request.left, rightSource: request.right }
        historyStore.addHistory(enriched)
        return enriched
      } catch (error) {
        if (controller.signal.aborted) {
          compareLogger.info(`[${request.compareId}] 对比已取消`)
        } else {
          compareLogger.error(`[${request.compareId}] 对比异常: ${error instanceof Error ? error.message : error}`)
        }
        throw error
      } finally {
        flushEntryUpdates()
        if (flushTimer) {
          clearTimeout(flushTimer)
          flushTimer = null
        }
        entryUpdateBuffer.length = 0
        sender.off('destroyed', onDestroyed)
        sender.off('render-process-gone', onRenderProcessGone)
        compareLogger.info(`[${request.compareId}] 释放对比资源，已发送扫描批次=${scanBatchCount} 条目更新=${sentEntryUpdateCount}`)
        await leftSource.dispose()
        await rightSource.dispose()
        clearActiveCompare(event.sender, request.compareId, controller)
      }
    }),
  )

  ipcMain.handle(IPC_CHANNELS.COMPARE_CANCEL, (event, compareId?: string) =>
    wrapHandler(async () => {
      cancelActiveCompare(event.sender, compareId)
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

function registerSyncHandlers(): void {
  syncManager.subscribe((task) => {
    for (const win of BrowserWindow.getAllWindows()) {
      safeSendToWindow(win, IPC_CHANNELS.SYNC_PROGRESS, task)
    }
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_START, (_event, request: StartSyncRequest) =>
    wrapHandler(async () => syncManager.start(request)),
  )

  ipcMain.handle(IPC_CHANNELS.SYNC_PAUSE, () =>
    wrapHandler(async () => syncManager.pause()),
  )

  ipcMain.handle(IPC_CHANNELS.SYNC_RESUME, () =>
    wrapHandler(async () => syncManager.resume()),
  )

  ipcMain.handle(IPC_CHANNELS.SYNC_GET_STATUS, () =>
    wrapHandler(async () => syncManager.getSnapshot()),
  )

  ipcMain.handle(IPC_CHANNELS.SYNC_CLEAR, () =>
    wrapHandler(async () => syncManager.clear()),
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
  registerSyncHandlers()
  registerDialogHandlers()
  registerFileOperationHandlers()
}
