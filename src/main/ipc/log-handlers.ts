import { ipcMain } from 'electron'
import type { LogEntry } from '@shared/types'
import { IPC_CHANNELS } from '@shared/types'
import { writeLogFile } from '../utils/logger'

const VALID_LOG_SCOPES = new Set(['app', 'compare', 'compare-watch', 'sync', 'ssh'])
const VALID_LOG_LEVELS = new Set(['info', 'warn', 'error'])

function isRendererLogEntry(value: unknown): value is LogEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<LogEntry>
  return typeof entry.timestamp === 'number'
    && typeof entry.message === 'string'
    && VALID_LOG_SCOPES.has(String(entry.scope))
    && VALID_LOG_LEVELS.has(String(entry.level))
}

export function registerLogHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.LOG_WRITE, (_event, entry: unknown) => {
    if (!isRendererLogEntry(entry)) return
    writeLogFile(entry)
  })
}
