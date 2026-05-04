import { app, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/types'
import type { LogEntry, LogLevel, LogScope } from '@shared/types'
import { safeSendToWindow } from './safe-ipc'
import { appendFile, mkdir } from 'fs/promises'
import { join } from 'path'

interface ScopedLogger {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
  child: (scope: LogScope) => ScopedLogger
}

function send(scope: LogScope, level: LogLevel, message: string): void {
  const entry: LogEntry = { timestamp: Date.now(), scope, level, message }
  writeLogFile(entry)
  for (const win of BrowserWindow.getAllWindows()) {
    safeSendToWindow(win, IPC_CHANNELS.LOG, entry)
  }
}

export function getLogFilePath(): string {
  return join(app.getPath('userData'), 'logs', 'simple-diff.log')
}

export function writeLogFile(entry: LogEntry): void {
  if (!app.isReady()) return

  const timestamp = new Date(entry.timestamp).toISOString()
  const line = `${timestamp} [${entry.scope}] ${entry.level.toUpperCase()} ${entry.message}\n`

  void (async () => {
    try {
      const logDir = join(app.getPath('userData'), 'logs')
      await mkdir(logDir, { recursive: true })
      await appendFile(getLogFilePath(), line, 'utf-8')
    } catch {
      // logging must never break app behavior
    }
  })()
}

function createLogger(scope: LogScope): ScopedLogger {
  return {
    info: (message: string) => send(scope, 'info', message),
    warn: (message: string) => send(scope, 'warn', message),
    error: (message: string) => send(scope, 'error', message),
    child: (childScope: LogScope) => createLogger(childScope),
  }
}

export const logger = createLogger('app')
