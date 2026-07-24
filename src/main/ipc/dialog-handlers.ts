import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types'

export function registerDialogHandlers(): void {
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
