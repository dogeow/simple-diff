import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types'
import { wrapHandler } from '../utils/error'
import * as historyStore from '../history/history-store'

export function registerHistoryHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.HISTORY_LIST, () =>
    wrapHandler(async () => historyStore.listHistory()),
  )

  ipcMain.handle(IPC_CHANNELS.HISTORY_CLEAR, () =>
    wrapHandler(async () => historyStore.clearHistory()),
  )

  ipcMain.handle(IPC_CHANNELS.HISTORY_DELETE, (_event, id: string) =>
    wrapHandler(async () => historyStore.deleteHistory(id)),
  )
}
