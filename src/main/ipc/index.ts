import { getLogFilePath, logger } from '../utils/logger'
import { registerLogHandlers } from './log-handlers'
import { registerFileHandlers } from './file-handlers'
import { registerCompareHandlers } from './compare-handlers'
import { registerCompareLocalWatchHandlers } from './compare-watch-handlers'
import { registerSSHHandlers } from './ssh-handlers'
import { registerHistoryHandlers } from './history-handlers'
import { registerSyncHandlers } from './sync-handlers'
import { registerDialogHandlers } from './dialog-handlers'
import { registerFileOperationHandlers } from './file-operation-handlers'

export function registerAllHandlers(): void {
  registerLogHandlers()
  registerFileHandlers()
  registerCompareHandlers()
  registerCompareLocalWatchHandlers()
  registerSSHHandlers()
  registerHistoryHandlers()
  registerSyncHandlers()
  registerDialogHandlers()
  registerFileOperationHandlers()
  logger.info(`日志文件: ${getLogFilePath()}`)
}
