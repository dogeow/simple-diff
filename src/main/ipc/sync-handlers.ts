import { BrowserWindow, ipcMain } from 'electron'
import type { StartSyncRequest } from '@shared/types'
import { IPC_CHANNELS } from '@shared/types'
import { wrapHandler } from '../utils/error'
import { safeSendToWindow } from '../utils/safe-ipc'
import { syncManager } from '../sync/sync-manager'
import { assertSyncStartRequestEntries } from './active-compare'

export function registerSyncHandlers(): void {
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
