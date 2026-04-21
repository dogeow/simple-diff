import type { WebContents, BrowserWindow } from 'electron'

export function safeSendToWebContents(
  webContents: WebContents,
  channel: string,
  ...args: unknown[]
): boolean {
  try {
    if (typeof webContents.isDestroyed === 'function' && webContents.isDestroyed()) return false
    webContents.send(channel, ...args)
    return true
  } catch {
    return false
  }
}

export function safeSendToWindow(
  win: BrowserWindow,
  channel: string,
  ...args: unknown[]
): boolean {
  if (win.isDestroyed()) return false
  return safeSendToWebContents(win.webContents, channel, ...args)
}
