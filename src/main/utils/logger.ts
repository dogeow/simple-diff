import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/types'
import type { LogEntry, LogLevel, LogScope } from '@shared/types'
import { safeSendToWindow } from './safe-ipc'

interface ScopedLogger {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
  child: (scope: LogScope) => ScopedLogger
}

function send(scope: LogScope, level: LogLevel, message: string): void {
  const entry: LogEntry = { timestamp: Date.now(), scope, level, message }
  for (const win of BrowserWindow.getAllWindows()) {
    safeSendToWindow(win, IPC_CHANNELS.LOG, entry)
  }
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
