import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { AppAPI } from '@shared/app-api'
import { computeTextDiff } from '@shared/text-diff'
import type {
  CompareEntry,
  CompareHistoryEntry,
  CompareLocalWatchRequest,
  ComparePartialRequest,
  CompareRequest,
  CompareResult,
  FileEntry,
  IpcResult,
  LogEntry,
  SourceConfig,
  SSHConfig,
  SSHConfigInput,
  StartSyncRequest,
  SyncTaskSnapshot,
  TextDiffResult,
} from '@shared/types'

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
  let disposed = false
  let unlisten: UnlistenFn | null = null
  void listen<T>(event, (e) => {
    callback(e.payload)
  }).then((fn) => {
    // 清理可能发生在 listen 完成之前（如 StrictMode 双挂载）：此时立即注销，避免监听器泄漏
    if (disposed) {
      fn()
    } else {
      unlisten = fn
    }
  })
  return () => {
    disposed = true
    unlisten?.()
  }
}

/** Last native drop paths (Tauri onDragDropEvent); HTML5 File has no path in WKWebView. */
let lastNativeDropPaths: string[] = []

function rememberNativeDropPaths(paths: readonly string[]): void {
  lastNativeDropPaths = [...paths]
}

export function consumeNativeDropPath(): string | null {
  if (lastNativeDropPaths.length === 0) return null
  return lastNativeDropPaths.shift() ?? null
}

function ensureNativeDropListener(): void {
  if (typeof window === 'undefined') return
  if ((window as unknown as { __simpleDiffDropBound?: boolean }).__simpleDiffDropBound) return
  ;(window as unknown as { __simpleDiffDropBound?: boolean }).__simpleDiffDropBound = true

  void getCurrentWebview()
    .onDragDropEvent((event) => {
      if (event.payload.type === 'drop') {
        rememberNativeDropPaths(event.payload.paths)
      }
    })
    .catch(() => {
      // Not running inside Tauri webview (e.g. vitest)
    })
}

ensureNativeDropListener()

export const tauriApi: AppAPI = {
  runtime: {
    mode: 'tauri',
    supportsSftp: true,
    supportsHistory: true,
    supportsSync: true,
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

  startSync: (request: StartSyncRequest) =>
    wrap(() => invoke<IpcResult<SyncTaskSnapshot>>('sync_start', { request })),

  pauseSync: () =>
    wrap(() => invoke<IpcResult<SyncTaskSnapshot | null>>('sync_pause')),

  resumeSync: () =>
    wrap(() => invoke<IpcResult<SyncTaskSnapshot | null>>('sync_resume')),

  getSyncStatus: () =>
    wrap(() => invoke<IpcResult<SyncTaskSnapshot | null>>('sync_get_status')),

  clearSync: () =>
    wrap(() => invoke<IpcResult<void>>('sync_clear')),

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

  onSyncProgress: (callback) =>
    subscribe<SyncTaskSnapshot | null>('sync:progress', (task) => {
      callback(task)
    }),

  onLog: (callback) =>
    subscribe<LogEntry>('app:log', (entry) => {
      callback(entry)
    }),

  writeLog: (entry: LogEntry) => {
    void invoke('write_log', { entry })
  },

  textDiff: async (leftText, rightText): Promise<IpcResult<TextDiffResult>> => ({
    success: true,
    data: computeTextDiff(leftText, rightText),
  }),

  listSSHConfigs: () =>
    wrap(() => invoke<IpcResult<readonly SSHConfig[]>>('ssh_list_configs')),

  saveSSHConfig: (config: SSHConfigInput) =>
    wrap(() => invoke<IpcResult<SSHConfig>>('ssh_save_config', { input: config })),

  deleteSSHConfig: (id: string) =>
    wrap(() => invoke<IpcResult<void>>('ssh_delete_config', { id })),

  testSSHConnection: (id: string) =>
    wrap(() => invoke<IpcResult<boolean>>('ssh_test', { id })),

  browseSSH: (configId: string, dirPath: string) =>
    wrap(() => invoke<IpcResult<readonly FileEntry[]>>('ssh_browse', { configId, dirPath })),

  listHistory: () =>
    wrap(() => invoke<IpcResult<readonly CompareHistoryEntry[]>>('history_list')),

  clearHistory: () =>
    wrap(() => invoke<IpcResult<void>>('history_clear')),

  deleteHistory: (id: string) =>
    wrap(() => invoke<IpcResult<void>>('history_delete', { id })),

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

  onOpenPaths: (callback) =>
    subscribe<readonly string[]>('app:open-paths', (paths) => {
      callback(paths)
    }),

  getPathForFile: () => consumeNativeDropPath() ?? '',
}
