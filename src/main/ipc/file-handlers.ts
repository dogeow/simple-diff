import { ipcMain } from 'electron'
import type { SourceConfig } from '@shared/types'
import { IPC_CHANNELS } from '@shared/types'
import { createFileSource } from '../file-source/index'
import { wrapHandler } from '../utils/error'
import { resolveAllowedSourcePath } from './path-guards'

export function registerFileHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FILE_SOURCE_LIST, (_event, sourceConfig: SourceConfig, dirPath: string) =>
    wrapHandler(async () => {
      const safePath = resolveAllowedSourcePath(sourceConfig, dirPath)
      const source = await createFileSource(sourceConfig)
      try {
        return await source.list(safePath)
      } finally {
        await source.dispose()
      }
    }),
  )

  ipcMain.handle(IPC_CHANNELS.FILE_READ_TEXT, (_event, sourceConfig: SourceConfig, filePath: string) =>
    wrapHandler(async () => {
      if (!filePath) throw new Error('文件路径不能为空')
      const safePath = resolveAllowedSourcePath(sourceConfig, filePath)
      const source = await createFileSource(sourceConfig)
      try {
        return await source.readText(safePath)
      } finally {
        await source.dispose()
      }
    }),
  )

  ipcMain.handle(IPC_CHANNELS.FILE_WRITE_TEXT, (_event, sourceConfig: SourceConfig, filePath: string, content: string) =>
    wrapHandler(async () => {
      if (!filePath) throw new Error('文件路径不能为空')
      const safePath = resolveAllowedSourcePath(sourceConfig, filePath)
      const source = await createFileSource(sourceConfig)
      try {
        await source.writeText(safePath, content)
      } finally {
        await source.dispose()
      }
    }),
  )
}
