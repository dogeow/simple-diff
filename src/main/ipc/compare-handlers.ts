import { ipcMain } from 'electron'
import type { CompareEntry, CompareRequest } from '@shared/types'
import { IPC_CHANNELS } from '@shared/types'
import { formatDuration } from '@shared/format-duration'
import { computeTextDiff } from '@shared/text-diff'
import { createFileSource } from '../file-source/index'
import { compareDirectories } from '../compare/comparator'
import { wrapHandler } from '../utils/error'
import { logger } from '../utils/logger'
import { safeSendToWebContents } from '../utils/safe-ipc'
import * as historyStore from '../history/history-store'
import {
  cancelActiveCompare,
  clearActiveCompare,
  getActiveCompare,
  setActiveCompare,
  updateCompareSession,
} from './active-compare'

const compareLogger = logger.child('compare')
const ENTRY_UPDATE_FLUSH_INTERVAL_MS = 100
const ENTRY_UPDATE_FLUSH_THRESHOLD = 200
const SCAN_BATCH_LOG_LIMIT = 20
const SCAN_BATCH_LOG_INTERVAL = 200
const ENTRY_UPDATE_LOG_LIMIT = 20
const ENTRY_UPDATE_LOG_INTERVAL = 5000

function formatBytes(value: number): string {
  return `${(value / 1024 / 1024).toFixed(1)}MB`
}

function formatProcessMemoryUsage(): string {
  const memory = process.memoryUsage()
  return `rss=${formatBytes(memory.rss)} heap=${formatBytes(memory.heapUsed)}/${formatBytes(memory.heapTotal)} external=${formatBytes(memory.external)}`
}

export function registerCompareHandlers(): void {
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
