import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AppAPI } from '@shared/app-api'
import { computeTextDiff } from '@shared/text-diff'
import type {
  CompareEntry,
  CompareLocalWatchRequest,
  ComparePartialRequest,
  CompareRequest,
  CompareResult,
  FileEntry,
  IpcResult,
  LogEntry,
  SourceConfig,
  TextDiffResult,
} from '@shared/types'

function unsupported<T = never>(feature: string): Promise<IpcResult<T>> {
  return Promise.resolve({
    success: false,
    error: `当前 Tauri 版本暂不支持${feature}`,
  })
}

async function wrap<T>(fn: () => Promise<IpcResult<T>>): Promise<IpcResult<T>> {
  try {
    return await fn()
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function subscribe<T>(
  event: string,
  callback: (payload: T) => void,
): () => void {
  let unlisten: UnlistenFn | null = null
  void listen<T>(event, (e) => {
    callback(e.payload)
  }).then((fn) => {
    unlisten = fn
  })
  return () => {
    unlisten?.()
  }
}

export const tauriApi: AppAPI = {
  runtime: {
    mode: 'tauri',
    supportsSftp: false,
    supportsHistory: false,
    supportsSync: false,
    supportsNativeFolderSelection: true,
    supportsDirectoryDragDrop: true,
    supportsWriteBack: true,
  },

  listFiles: (source, dirPath) =>
    wrap(() => invoke<IpcResult<readonly FileEntry[]>>('list_files', { source, dirPath })),

  readText: (source, filePath) =>
    wrap(() => invoke<IpcResult<string>>('read_text_file', { source, filePath })),

  writeText: (source, filePath, content) =>
    wrap(() => invoke<IpcResult<void>>('write_text_file', { source, filePath, content })),

  runCompare: (request: CompareRequest) =>
    wrap(() => invoke<IpcResult<CompareResult>>('run_compare', { request })),

  runPartialCompare: (request: ComparePartialRequest) =>
    wrap(() => invoke<IpcResult<CompareResult>>('run_partial_compare', { request })),

  cancelCompare: (compareId?: string) =>
    wrap(() => invoke<IpcResult<void>>('cancel_compare', { compareId: compareId ?? null })),

  startLocalCompareWatch: (request: CompareLocalWatchRequest) =>
    wrap(() => invoke<IpcResult<void>>('start_local_compare_watch', { request })),

  stopLocalCompareWatch: (sessionId?: string) =>
    wrap(() => invoke<IpcResult<void>>('stop_local_compare_watch', { sessionId: sessionId ?? null })),

  startSync: () => unsupported('同步'),
  pauseSync: () => unsupported('同步'),
  resumeSync: () => unsupported('同步'),
  getSyncStatus: () => Promise.resolve({ success: true, data: null }),
  clearSync: () => unsupported('同步'),

  onScanComplete: (callback) =>
    subscribe<[string, readonly CompareEntry[]]>('compare:scan-complete', ([compareId, entries]) => {
      callback(compareId, entries)
    }),

  onEntryUpdate: (callback) =>
    subscribe<[string, readonly CompareEntry[]]>('compare:entry-update', ([compareId, entries]) => {
      callback(compareId, entries)
    }),

  onCompareLocalDirty: (callback) =>
    subscribe<[string, readonly string[]]>('compare:local-dirty', ([sessionId, paths]) => {
      callback(sessionId, paths)
    }),

  onSyncProgress: () => () => undefined,

  onLog: () => () => undefined,
  writeLog: (entry: LogEntry) => {
    void invoke('write_log', { message: `[${entry.scope}/${entry.level}] ${entry.message}` })
  },

  textDiff: async (leftText, rightText): Promise<IpcResult<TextDiffResult>> => ({
    success: true,
    data: computeTextDiff(leftText, rightText),
  }),

  listSSHConfigs: () => unsupported('SSH'),
  saveSSHConfig: () => unsupported('SSH'),
  deleteSSHConfig: () => unsupported('SSH'),
  testSSHConnection: () => unsupported('SSH'),
  browseSSH: () => unsupported('SSH'),

  listHistory: () => unsupported('历史'),
  clearHistory: () => unsupported('历史'),
  deleteHistory: () => unsupported('历史'),

  showInFolder: (source: SourceConfig, relativePath: string) =>
    wrap(() => invoke<IpcResult<void>>('show_in_folder', { source, relativePath })),

  renameFile: (source, oldRelativePath, newName) =>
    wrap(() => invoke<IpcResult<void>>('rename_path', { source, oldRelativePath, newName })),

  deleteFile: (source, relativePath, isDirectory) =>
    wrap(() => invoke<IpcResult<void>>('delete_path', { source, relativePath, isDirectory })),

  selectFolder: () =>
    wrap(() => invoke<IpcResult<string | null>>('select_folder')),

  selectFile: () =>
    wrap(() => invoke<IpcResult<string | null>>('select_file')),

  onOpenPaths: () => () => undefined,

  getPathForFile: () => '',
}
