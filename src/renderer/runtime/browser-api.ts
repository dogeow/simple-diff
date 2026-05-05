import type { AppAPI } from '@shared/app-api'
import { computeTextDiff } from '@shared/text-diff'
import type { IpcResult, SourceConfig } from '../../../shared/types'
import { compareBrowserDirectories } from './browser-compare'
import {
  getBrowserRuntimeCapabilities,
  pickBrowserDirectory,
  registerDroppedBrowserDirectory,
  resolveBrowserRelativePath,
  resolveBrowserRoot,
} from './browser-roots'

const activeCompares = new Map<string, AbortController>()

function unsupportedResult<T>(error = '当前功能仅桌面版可用'): Promise<IpcResult<T>> {
  return Promise.resolve({ success: false, error })
}

function success<T>(data: T): IpcResult<T> {
  return { success: true, data }
}

function successVoid(): IpcResult<void> {
  return { success: true }
}

function getRegisteredLocalRoot(source: SourceConfig) {
  if (source.type !== 'local') {
    throw new Error('网页版当前仅支持本地目录对比')
  }

  const root = resolveBrowserRoot(source)
  if (!root) {
    throw new Error('浏览器目录句柄已失效，请重新选择目录')
  }

  return root
}

function toRelativePath(source: SourceConfig, fullPath: string): string {
  if (source.type !== 'local') {
    throw new Error('网页版当前仅支持本地目录对比')
  }

  return resolveBrowserRelativePath(source.path, fullPath)
}

async function runBrowserCompare(request: Parameters<AppAPI['runCompare']>[0]): Promise<IpcResult<ReturnType<typeof compareBrowserDirectories> extends Promise<infer T> ? T : never>> {
  const previousController = activeCompares.get(request.compareId)
  previousController?.abort()

  const controller = new AbortController()
  activeCompares.set(request.compareId, controller)

  try {
    const leftRoot = getRegisteredLocalRoot(request.left)
    const rightRoot = getRegisteredLocalRoot(request.right)
    const result = await compareBrowserDirectories({
      leftRoot,
      rightRoot,
      strategies: request.strategies,
      extensionFilter: request.extensionFilter,
      previousEntries: request.previousEntries,
      signal: controller.signal,
    })

    return success({
      ...result,
      leftSource: request.left,
      rightSource: request.right,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '对比失败'
    return { success: false, error: message }
  } finally {
    if (activeCompares.get(request.compareId) === controller) {
      activeCompares.delete(request.compareId)
    }
  }
}

const browserCapabilities = getBrowserRuntimeCapabilities()

export const browserApi: AppAPI = {
  runtime: {
    mode: 'web',
    supportsSftp: false,
    supportsHistory: false,
    supportsSync: false,
    supportsNativeFolderSelection: browserCapabilities.supportsNativeFolderSelection,
    supportsDirectoryDragDrop: browserCapabilities.supportsDirectoryDragDrop,
    supportsWriteBack: browserCapabilities.supportsWriteBack,
  },

  listFiles: async (source, dirPath) => {
    try {
      const root = getRegisteredLocalRoot(source)
      const relativePath = toRelativePath(source, dirPath)
      return success(await root.accessor.list(relativePath))
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '目录读取失败' }
    }
  },

  readText: async (source, filePath) => {
    try {
      const root = getRegisteredLocalRoot(source)
      const relativePath = toRelativePath(source, filePath)
      return success(await root.accessor.readText(relativePath))
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '文件读取失败' }
    }
  },

  writeText: async (source, filePath, content) => {
    try {
      const root = getRegisteredLocalRoot(source)
      if (!root.writable) {
        throw new Error('当前浏览器目录为只读来源，请重新通过目录选择器授权后再保存')
      }
      const relativePath = toRelativePath(source, filePath)
      await root.accessor.writeText(relativePath, content)
      return successVoid()
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '文件写入失败' }
    }
  },

  runCompare: runBrowserCompare,

  runPartialCompare: async (request) => {
    try {
      const leftRoot = getRegisteredLocalRoot(request.left)
      const rightRoot = getRegisteredLocalRoot(request.right)
      return success(await compareBrowserDirectories({
        leftRoot,
        rightRoot,
        strategies: request.strategies,
        extensionFilter: request.extensionFilter,
        previousEntries: request.previousEntries,
        relativeRoots: request.relativeRoots,
      }))
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '局部重比对失败' }
    }
  },

  cancelCompare: async (compareId) => {
    if (compareId) {
      activeCompares.get(compareId)?.abort()
      return successVoid()
    }

    for (const controller of activeCompares.values()) {
      controller.abort()
    }
    activeCompares.clear()
    return successVoid()
  },

  startLocalCompareWatch: async () => successVoid(),
  stopLocalCompareWatch: async () => successVoid(),
  startSync: () => unsupportedResult('网页版暂不支持同步能力'),
  pauseSync: async () => success(null),
  resumeSync: async () => success(null),
  getSyncStatus: async () => success(null),
  clearSync: async () => successVoid(),

  onScanComplete: () => () => undefined,
  onEntryUpdate: () => () => undefined,
  onCompareLocalDirty: () => () => undefined,
  onSyncProgress: () => () => undefined,

  onLog: () => () => undefined,
  writeLog: () => undefined,

  textDiff: async (leftText, rightText) => success(computeTextDiff(leftText, rightText)),

  listSSHConfigs: async () => success([]),
  saveSSHConfig: () => unsupportedResult('网页版暂不支持 SSH 管理'),
  deleteSSHConfig: () => unsupportedResult('网页版暂不支持 SSH 管理'),
  testSSHConnection: () => unsupportedResult('网页版暂不支持 SSH 管理'),
  browseSSH: () => unsupportedResult('网页版暂不支持 SSH 目录浏览'),

  listHistory: async () => success([]),
  clearHistory: async () => successVoid(),
  deleteHistory: async () => successVoid(),

  showInFolder: () => unsupportedResult('网页版无法在系统文件管理器中定位文件'),
  renameFile: () => unsupportedResult('网页版暂不支持重命名文件'),
  deleteFile: () => unsupportedResult('网页版暂不支持删除文件'),

  selectFolder: async () => {
    try {
      const sourcePath = await pickBrowserDirectory()
      return success(sourcePath)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '目录选择失败' }
    }
  },

  selectFile: () => unsupportedResult('网页版暂不支持系统文件选择器'),
  onOpenPaths: () => () => undefined,

  getPathForFile: () => '',
}

export { registerDroppedBrowserDirectory }