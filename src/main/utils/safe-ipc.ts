import type { WebContents, BrowserWindow } from 'electron'

export function isWebContentsAlive(webContents: WebContents | null | undefined): boolean {
  if (!webContents) return false
  try {
    if (typeof webContents.isDestroyed === 'function' && webContents.isDestroyed()) return false
    if (typeof webContents.isCrashed === 'function' && webContents.isCrashed()) return false
    // mainFrame may be missing or disposed during reload / navigation; calling send() in this
    // state causes Electron to log "Render frame was disposed before WebFrameMain could be accessed"
    // from native code, which we cannot catch via try/catch.
    const mainFrame = (webContents as unknown as { mainFrame?: { isDestroyed?: () => boolean } }).mainFrame
    if (!mainFrame) return false
    if (typeof mainFrame.isDestroyed === 'function' && mainFrame.isDestroyed()) return false
    if (typeof webContents.isLoadingMainFrame === 'function' && webContents.isLoadingMainFrame()) return false
  } catch {
    return false
  }
  return true
}

export function safeSendToWebContents(
  webContents: WebContents,
  channel: string,
  ...args: unknown[]
): boolean {
  if (!isWebContentsAlive(webContents)) return false
  try {
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
