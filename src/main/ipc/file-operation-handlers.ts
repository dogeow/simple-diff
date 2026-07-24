import { ipcMain, shell } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import type { SourceConfig } from '@shared/types'
import { IPC_CHANNELS } from '@shared/types'
import { wrapHandler } from '../utils/error'
import { buildRenameTarget, resolveAllowedLocalPath } from './path-guards'

export function registerFileOperationHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FILE_SHOW_IN_FOLDER, (_event, source: SourceConfig, relativePath: string) =>
    wrapHandler(async () => {
      const filePath = resolveAllowedLocalPath(source, relativePath)
      shell.showItemInFolder(filePath)
    }),
  )

  ipcMain.handle(IPC_CHANNELS.FILE_RENAME, (_event, source: SourceConfig, oldRelativePath: string, newName: string) =>
    wrapHandler(async () => {
      const { oldPath, newPath } = buildRenameTarget(source, oldRelativePath, newName)
      await fs.rename(oldPath, newPath)
    }),
  )

  ipcMain.handle(IPC_CHANNELS.FILE_DELETE, (_event, source: SourceConfig, relativePath: string, isDirectory: boolean) =>
    wrapHandler(async () => {
      if (!relativePath) {
        throw new Error('文件路径不能为空')
      }
      const filePath = resolveAllowedLocalPath(source, relativePath)
      const sourceRoot = path.resolve(source.path)
      const relativeToRoot = path.relative(sourceRoot, filePath)
      if (relativeToRoot === '' || relativeToRoot === '.') {
        throw new Error('不允许删除根目录')
      }
      if (isDirectory) {
        await fs.rm(filePath, { recursive: true })
      } else {
        await fs.unlink(filePath)
      }
    }),
  )
}
