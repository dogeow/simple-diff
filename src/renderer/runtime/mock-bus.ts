import type { CompareEntry, IpcResult, LogEntry, SyncTaskSnapshot } from '@shared/types'

/** 浏览器预览模式的事件总线与通用响应工具。 */

export const IO_DELAY_MS = 120

interface Emitter<Args extends readonly unknown[]> {
  readonly subscribe: (listener: (...args: Args) => void) => (() => void)
  readonly emit: (...args: Args) => void
}

function createEmitter<Args extends readonly unknown[]>(): Emitter<Args> {
  const listeners = new Set<(...args: Args) => void>()

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit: (...args) => {
      for (const listener of [...listeners]) listener(...args)
    },
  }
}

export const scanEmitter = createEmitter<[string, readonly CompareEntry[]]>()
export const entryEmitter = createEmitter<[string, readonly CompareEntry[]]>()
export const localDirtyEmitter = createEmitter<[string, readonly string[]]>()
export const syncEmitter = createEmitter<[SyncTaskSnapshot | null]>()
export const openPathsEmitter = createEmitter<[readonly string[]]>()

const logEmitter = createEmitter<[LogEntry]>()

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function ok<T>(data: T, ms = IO_DELAY_MS): Promise<IpcResult<T>> {
  await delay(ms)
  return { success: true, data }
}

export function mockLog(entry: Omit<LogEntry, 'timestamp'>): void {
  logEmitter.emit({ ...entry, timestamp: Date.now() })
}

const BACKLOG_LOGS: readonly Omit<LogEntry, 'timestamp'>[] = [
  { level: 'info', scope: 'app', message: '[mock] 浏览器预览模式启动，window.api 由 mock-api 提供' },
  { level: 'info', scope: 'app', message: '[mock] 已加载示例对比数据' },
  { level: 'info', scope: 'compare', message: '[mock] 上次对比会话已从示例数据恢复' },
  { level: 'warn', scope: 'compare-watch', message: '[mock] 浏览器环境不支持本地文件监听，已跳过' },
  { level: 'info', scope: 'sync', message: '[mock] 检测到未完成的同步任务，将继续推进' },
  { level: 'info', scope: 'ssh', message: '[mock] 已加载 2 个 SFTP 连接配置' },
  { level: 'error', scope: 'ssh', message: '[mock] 生产 prod-01 上次连接超时（示例错误日志）' },
]

let logBacklogFlushed = false

/** 首个订阅者接入后补发启动日志，让日志面板的计数非零。 */
export function subscribeLog(listener: (entry: LogEntry) => void): () => void {
  const unsubscribe = logEmitter.subscribe(listener)

  if (!logBacklogFlushed) {
    logBacklogFlushed = true
    setTimeout(() => {
      for (const entry of BACKLOG_LOGS) mockLog(entry)
    }, 0)
  }

  return unsubscribe
}
