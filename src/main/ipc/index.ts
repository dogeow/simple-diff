import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { IPC_CHANNELS } from '@shared/types'
import type { CompareEntry, CompareRequest, LogEntry, SourceConfig, SSHConfigInput, StartSyncRequest } from '@shared/types'
import { formatDuration } from '@shared/format-duration'
import { normalizePathSegment, normalizeRelativePath, resolveSourcePath } from '@shared/source-path'
import { createFileSource } from '../file-source/index'
import { compareDirectories } from '../compare/comparator'
import { computeTextDiff } from '@shared/text-diff'
import { wrapHandler } from '../utils/error'
import { getLogFilePath, logger, writeLogFile } from '../utils/logger'
import { safeSendToWebContents, safeSendToWindow } from '../utils/safe-ipc'
import * as configStore from '../ssh/config-store'
import { connectionManager } from '../ssh/connection-manager'
import { getConfigInternal } from '../ssh/config-store'
import * as historyStore from '../history/history-store'
import { syncManager } from '../sync/sync-manager'
import { localCompareWatchManager } from '../compare/local-watch-manager'

const compareLogger = logger.child('compare')
const ENTRY_UPDATE_FLUSH_INTERVAL_MS = 100
const ENTRY_UPDATE_FLUSH_THRESHOLD = 200
const SCAN_BATCH_LOG_LIMIT = 20
const SCAN_BATCH_LOG_INTERVAL = 200
const ENTRY_UPDATE_LOG_LIMIT = 20
const ENTRY_UPDATE_LOG_INTERVAL = 5000
const VALID_LOG_SCOPES = new Set(['app', 'compare', 'compare-watch', 'sync', 'ssh'])
const VALID_LOG_LEVELS = new Set(['info', 'warn', 'error'])

function resolveAllowedLocalPath(source: SourceConfig, relativePath: string): string {
  if (source.type !== 'local') {
    throw new Error('当前操作仅支持本地路径')
  }

  const sourceRoot = path.resolve(source.path)
  const inputPath = path.isAbsolute(relativePath) ? relativePath : resolveSourcePath(source, relativePath)
  const resolvedPath = path.resolve(inputPath)
  const relative = path.relative(sourceRoot, resolvedPath)
  if (relative === '' || relative === '.') {
    return resolvedPath
  }
  if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error('文件路径超出允许范围')
  }

  return resolvedPath
}

function resolveAllowedSourcePath(source: SourceConfig, filePath: string): string {
  if (source.type === 'local') {
    return resolveAllowedLocalPath(source, filePath)
  }

  const sourceRoot = path.posix.resolve(source.path || '/')
  const normalizedInput = filePath.replace(/\\/g, '/')
  const resolvedPath = path.posix.resolve(
    path.posix.isAbsolute(normalizedInput)
      ? normalizedInput
      : path.posix.join(sourceRoot, normalizedInput),
  )
  const relative = path.posix.relative(sourceRoot, resolvedPath)
  if (relative === '' || relative === '.') return resolvedPath
  if (relative === '..' || relative.startsWith(`../`)) {
    throw new Error('文件路径超出允许范围')
  }

  return resolvedPath
}

function buildRenameTarget(source: SourceConfig, oldRelativePath: string, newName: string): {
  oldPath: string
  newPath: string
} {
  if (oldRelativePath === '') {
    throw new Error('无法重命名根目录')
  }

  const oldPath = resolveAllowedLocalPath(source, oldRelativePath)
  const safeName = normalizePathSegment(newName)
  const parentRelativePath = oldRelativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .slice(0, -1)
    .join('/')

  const newRelativePath = parentRelativePath ? `${parentRelativePath}/${safeName}` : safeName

  return {
    oldPath,
    newPath: resolveSourcePath(source, newRelativePath),
  }
}

function formatBytes(value: number): string {
  return `${(value / 1024 / 1024).toFixed(1)}MB`
}

function formatProcessMemoryUsage(): string {
  const memory = process.memoryUsage()
  return `rss=${formatBytes(memory.rss)} heap=${formatBytes(memory.heapUsed)}/${formatBytes(memory.heapTotal)} external=${formatBytes(memory.external)}`
}

function isRendererLogEntry(value: unknown): value is LogEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<LogEntry>
  return typeof entry.timestamp === 'number'
    && typeof entry.message === 'string'
    && VALID_LOG_SCOPES.has(String(entry.scope))
    && VALID_LOG_LEVELS.has(String(entry.level))
}

function registerLogHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.LOG_WRITE, (_event, entry: unknown) => {
    if (!isRendererLogEntry(entry)) return
    writeLogFile(entry)
  })
}

interface ActiveCompare {
  readonly compareId: string
  leftSource: SourceConfig
  rightSource: SourceConfig
  controller: AbortController | null
  leftToRightEntries: Map<string, { readonly isDirectory: boolean, readonly state: CompareEntry['state'] }>
  rightToLeftEntries: Map<string, { readonly isDirectory: boolean, readonly state: CompareEntry['state'] }>
  updatedAt: number
}

const MAX_ACTIVE_COMPARER_ENTRIES_BY_SENDER = 32

const activeCompares = new WeakMap<object, Map<string, ActiveCompare>>()

function getActiveCompareMap(sender: object): Map<string, ActiveCompare> {
  let compares = activeCompares.get(sender)
  if (!compares) {
    compares = new Map<string, ActiveCompare>()
    activeCompares.set(sender, compares)
  }
  return compares
}

function pruneActiveCompares(sender: object): void {
  const compares = activeCompares.get(sender)
  if (!compares || compares.size <= MAX_ACTIVE_COMPARER_ENTRIES_BY_SENDER) return

  const entries = Array.from(compares.entries())
    .filter(([, compare]) => compare.controller == null)
    .sort((a, b) => a[1].updatedAt - b[1].updatedAt)

  for (const [compareId] of entries) {
    if (compares.size <= MAX_ACTIVE_COMPARER_ENTRIES_BY_SENDER) break
    compares.delete(compareId)
  }
}

function setActiveCompare(sender: object, compare: Omit<ActiveCompare, 'updatedAt'>): void {
  const compares = getActiveCompareMap(sender)
  compares.set(compare.compareId, {
    ...compare,
    updatedAt: Date.now(),
  })

  pruneActiveCompares(sender)
}

function updateCompareSession(sender: object, compareId: string, entries: readonly CompareEntry[]): void {
  const compare = getActiveCompare(sender, compareId)
  if (!compare) return

  for (const entry of entries) {
    let normalizedPath: string

    try {
      normalizedPath = normalizeRelativePath(entry.relativePath, '/')
    } catch {
      continue
    }

    if (entry.state === 'left_only') {
      compare.leftToRightEntries.set(normalizedPath, {
        isDirectory: entry.isDirectory,
        state: entry.state,
      })
      compare.rightToLeftEntries.delete(normalizedPath)
      continue
    }

    if (entry.state === 'right_only') {
      compare.rightToLeftEntries.set(normalizedPath, {
        isDirectory: entry.isDirectory,
        state: entry.state,
      })
      compare.leftToRightEntries.delete(normalizedPath)
      continue
    }

    compare.leftToRightEntries.delete(normalizedPath)
    compare.rightToLeftEntries.delete(normalizedPath)
  }

  compare.updatedAt = Date.now()
}

function isSourceConfigSame(left: SourceConfig, right: SourceConfig): boolean {
  if (left.type !== right.type) {
    return false
  }

  if (left.path !== right.path) {
    return false
  }

  return left.type !== 'sftp' || left.configId === right.configId
}

function assertSyncStartRequestEntries(
  sender: object,
  request: StartSyncRequest,
): readonly CompareEntry[] {
  const compare = getActiveCompare(sender, request.compareId)
  if (!compare) {
    throw new Error('未找到匹配的对比会话')
  }

  if (!isSourceConfigSame(compare.leftSource, request.leftSource)
    || !isSourceConfigSame(compare.rightSource, request.rightSource)) {
    throw new Error('当前对比会话与同步参数不一致')
  }

  const expectedState: CompareEntry['state'] = request.direction === 'left_to_right' ? 'left_only' : 'right_only'
  const allowedEntries = request.direction === 'left_to_right'
    ? compare.leftToRightEntries
    : compare.rightToLeftEntries

  const sanitizedEntries: CompareEntry[] = []

  for (const entry of request.entries) {
    const normalizedPath = normalizeRelativePath(entry.relativePath, '/')
    const expected = allowedEntries.get(normalizedPath)

    if (!expected || expected.state !== expectedState || expected.isDirectory !== entry.isDirectory) {
      throw new Error('同步条目不在受信任范围')
    }

    if (entry.relativePath === normalizedPath) {
      sanitizedEntries.push(entry)
    } else {
      sanitizedEntries.push({ ...entry, relativePath: normalizedPath })
    }
  }

  return sanitizedEntries
}

function getActiveCompare(sender: object, compareId: string): ActiveCompare | null {
  return activeCompares.get(sender)?.get(compareId) ?? null
}

function clearActiveCompare(sender: object, compareId: string, controller: AbortController): void {
  const compares = activeCompares.get(sender)
  const activeCompare = compares?.get(compareId)
  if (activeCompare?.controller === controller) {
    activeCompare.controller = null
  }
  if (!compares) return

  if (compares.size > MAX_ACTIVE_COMPARER_ENTRIES_BY_SENDER) {
    pruneActiveCompares(sender)
  }
  if (compares.size === 0) {
    activeCompares.delete(sender)
  }
}

function cancelActiveCompare(sender: object, compareId?: string): void {
  const compares = activeCompares.get(sender)
  if (!compares) return

  if (compareId) {
    const compare = compares.get(compareId)
    compare?.controller?.abort()
    return
  }

  for (const compare of compares.values()) {
    compare.controller?.abort()
  }
}

function registerFileHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FILE_SOURCE_LIST, (_event, sourceConfig: SourceConfig, dirPath: string) =>
    wrapHandler(async () => {
      const safePath = resolveAllowedSourcePath(sourceConfig, dirPath)
      const source = await createFileSource(sourceConfig)
      try {
        return await source.list(safePath)
      } finally {
        await source.dispose()
      }
    }),
  )

  ipcMain.handle(IPC_CHANNELS.FILE_READ_TEXT, (_event, sourceConfig: SourceConfig, filePath: string) =>
    wrapHandler(async () => {
      if (!filePath) throw new Error('文件路径不能为空')
      const safePath = resolveAllowedSourcePath(sourceConfig, filePath)
      const source = await createFileSource(sourceConfig)
      try {
        return await source.readText(safePath)
      } finally {
        await source.dispose()
      }
    }),
  )

  ipcMain.handle(IPC_CHANNELS.FILE_WRITE_TEXT, (_event, sourceConfig: SourceConfig, filePath: string, content: string) =>
    wrapHandler(async () => {
      if (!filePath) throw new Error('文件路径不能为空')
      const safePath = resolveAllowedSourcePath(sourceConfig, filePath)
      const source = await createFileSource(sourceConfig)
      try {
        await source.writeText(safePath, content)
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
      setActiveCompare(event.sender, {
        compareId: request.compareId,
        leftSource: request.left,
        rightSource: request.right,
        controller,
        leftToRightEntries: new Map<string, { readonly isDirectory: boolean, readonly state: CompareEntry['state'] }>(),
        rightToLeftEntries: new Map<string, { readonly isDirectory: boolean, readonly state: CompareEntry['state'] }>(),
      })

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
            updateCompareSession(event.sender, request.compareId, entries)
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
            updateCompareSession(event.sender, request.compareId, [entry])
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

        updateCompareSession(event.sender, request.compareId, result.entries)
        flushEntryUpdates()
        compareLogger.info(`[${request.compareId}] 对比完成，耗时 ${formatDuration(result.duration)} — 相同:${result.stats.equal} 不同:${result.stats.different} 仅左:${result.stats.leftOnly} 仅右:${result.stats.rightOnly} mem=${formatProcessMemoryUsage()}`)

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

  ipcMain.handle(IPC_CHANNELS.COMPARE_RUN_PARTIAL, (_event, request) =>
    wrapHandler(async () => {
      compareLogger.info(`[partial] 开始局部重比对 roots=${request.relativeRoots.join('、') || '.'}`)

      const leftSource = await createFileSource(request.left)
      const rightSource = await createFileSource(request.right)

      try {
        return await compareDirectories({
          leftSource,
          rightSource,
          leftRoot: request.left.path,
          rightRoot: request.right.path,
          relativeRoots: request.relativeRoots,
          strategies: request.strategies,
          extensionFilter: request.extensionFilter,
          previousEntries: request.previousEntries,
        })
      } finally {
        await leftSource.dispose()
        await rightSource.dispose()
      }
    }),
  )

  ipcMain.handle(IPC_CHANNELS.TEXT_DIFF, (_event, leftText: string, rightText: string) =>
    wrapHandler(async () => {
      return computeTextDiff(leftText, rightText)
    }),
  )
}

function registerCompareLocalWatchHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.COMPARE_LOCAL_WATCH_START, (event, request) =>
    wrapHandler(async () => {
      await localCompareWatchManager.start(event.sender, request)
    }),
  )

  ipcMain.handle(IPC_CHANNELS.COMPARE_LOCAL_WATCH_STOP, (event, sessionId?: string) =>
    wrapHandler(async () => {
      await localCompareWatchManager.stop(event.sender, sessionId)
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

  ipcMain.handle(IPC_CHANNELS.SYNC_START, (event, request: StartSyncRequest) =>
    wrapHandler(async () => {
      const entries = assertSyncStartRequestEntries(event.sender, request)
      return syncManager.start({ ...request, entries })
    }),
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
  ipcMain.handle(IPC_CHANNELS.FILE_SHOW_IN_FOLDER, (_event, source: SourceConfig, relativePath: string) =>
    wrapHandler(async () => {
      const filePath = resolveAllowedLocalPath(source, relativePath)
      shell.showItemInFolder(filePath)
    }),
  )

  ipcMain.handle(IPC_CHANNELS.FILE_RENAME, (_event, source: SourceConfig, oldRelativePath: string, newName: string) =>
    wrapHandler(async () => {
      const { oldPath, newPath } = buildRenameTarget(source, oldRelativePath, newName)
      await fs.rename(oldPath, newPath)
    }),
  )

  ipcMain.handle(IPC_CHANNELS.FILE_DELETE, (_event, source: SourceConfig, relativePath: string, isDirectory: boolean) =>
    wrapHandler(async () => {
      if (!relativePath) {
        throw new Error('文件路径不能为空')
      }
      const filePath = resolveAllowedLocalPath(source, relativePath)
      const sourceRoot = path.resolve(source.path)
      const relativeToRoot = path.relative(sourceRoot, filePath)
      if (relativeToRoot === '' || relativeToRoot === '.') {
        throw new Error('不允许删除根目录')
      }
      if (isDirectory) {
        await fs.rm(filePath, { recursive: true })
      } else {
        await fs.unlink(filePath)
      }
    }),
  )
}

export function registerAllHandlers(): void {
  registerLogHandlers()
  registerFileHandlers()
  registerCompareHandlers()
  registerCompareLocalWatchHandlers()
  registerSSHHandlers()
  registerHistoryHandlers()
  registerSyncHandlers()
  registerDialogHandlers()
  registerFileOperationHandlers()
  logger.info(`日志文件: ${getLogFilePath()}`)
}
