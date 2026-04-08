import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/types'
import type { LogLevel } from '@shared/types'

function send(level: LogLevel, message: string): void {
  const entry = { timestamp: Date.now(), level, message }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.LOG, entry)
    }
  }
}

export const logger = {
  info: (message: string) => send('info', message),
  warn: (message: string) => send('warn', message),
  error: (message: string) => send('error', message),
}
