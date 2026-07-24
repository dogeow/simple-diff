import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types'
import { wrapHandler } from '../utils/error'
import { localCompareWatchManager } from '../compare/local-watch-manager'

export function registerCompareLocalWatchHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.COMPARE_LOCAL_WATCH_START, (event, request) =>
    wrapHandler(async () => {
      await localCompareWatchManager.start(event.sender, request)
    }),
  )

  ipcMain.handle(IPC_CHANNELS.COMPARE_LOCAL_WATCH_STOP, (event, sessionId?: string) =>
    wrapHandler(async () => {
      await localCompareWatchManager.stop(event.sender, sessionId)
    }),
  )
}
