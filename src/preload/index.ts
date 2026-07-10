import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppAPI as SharedAppAPI } from '../../shared/app-api'
import { IPC_CHANNELS } from '../../shared/types'
import type {
  CompareEntry,
  CompareLocalWatchRequest,
  CompareRequest,
  ComparePartialRequest,
  CompareResult,
  LogEntry,
  SourceConfig,
  FileEntry,
  IpcResult,
  StartSyncRequest,
  SSHConfig,
  SSHConfigInput,
  SyncTaskSnapshot,
  TextDiffResult,
  CompareHistoryEntry,
} from '../../shared/types'

const api = {
  runtime: {
    mode: 'electron',
    supportsSftp: true,
    supportsHistory: true,
    supportsSync: true,
    supportsNativeFolderSelection: true,
    supportsDirectoryDragDrop: true,
    supportsWriteBack: true,
  },

  // File source
  listFiles: (source: SourceConfig, dirPath: string): Promise<IpcResult<readonly FileEntry[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_SOURCE_LIST, source, dirPath),

  readText: (source: SourceConfig, filePath: string): Promise<IpcResult<string>> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_READ_TEXT, source, filePath),

  writeText: (source: SourceConfig, filePath: string, content: string): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_WRITE_TEXT, source, filePath, content),

  // Compare
  runCompare: (request: CompareRequest): Promise<IpcResult<CompareResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.COMPARE_RUN, request),

  runPartialCompare: (request: ComparePartialRequest): Promise<IpcResult<CompareResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.COMPARE_RUN_PARTIAL, request),

  cancelCompare: (compareId?: string): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.COMPARE_CANCEL, compareId),

  startLocalCompareWatch: (request: CompareLocalWatchRequest): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.COMPARE_LOCAL_WATCH_START, request),

  stopLocalCompareWatch: (sessionId?: string): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.COMPARE_LOCAL_WATCH_STOP, sessionId),

  startSync: (request: StartSyncRequest): Promise<IpcResult<SyncTaskSnapshot>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SYNC_START, request),

  pauseSync: (): Promise<IpcResult<SyncTaskSnapshot | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SYNC_PAUSE),

  resumeSync: (): Promise<IpcResult<SyncTaskSnapshot | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SYNC_RESUME),

  getSyncStatus: (): Promise<IpcResult<SyncTaskSnapshot | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SYNC_GET_STATUS),

  clearSync: (): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SYNC_CLEAR),

  onScanComplete: (callback: (compareId: string, entries: readonly CompareEntry[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, compareId: string, entries: readonly CompareEntry[]) =>
      callback(compareId, entries)
    ipcRenderer.on(IPC_CHANNELS.COMPARE_SCAN_COMPLETE, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.COMPARE_SCAN_COMPLETE, listener)
    }
  },

  onEntryUpdate: (callback: (compareId: string, entries: readonly CompareEntry[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, compareId: string, entries: readonly CompareEntry[]) =>
      callback(compareId, entries)
    ipcRenderer.on(IPC_CHANNELS.COMPARE_ENTRY_UPDATE, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.COMPARE_ENTRY_UPDATE, listener)
    }
  },

  onCompareLocalDirty: (callback: (sessionId: string, paths: readonly string[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string, paths: readonly string[]) =>
      callback(sessionId, paths)
    ipcRenderer.on(IPC_CHANNELS.COMPARE_LOCAL_DIRTY, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.COMPARE_LOCAL_DIRTY, listener)
    }
  },

  onSyncProgress: (callback: (task: SyncTaskSnapshot | null) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, task: SyncTaskSnapshot | null) => callback(task)
    ipcRenderer.on(IPC_CHANNELS.SYNC_PROGRESS, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SYNC_PROGRESS, listener)
    }
  },

  // Log
  onLog: (callback: (entry: LogEntry) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: LogEntry) => callback(entry)
    ipcRenderer.on(IPC_CHANNELS.LOG, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.LOG, listener)
    }
  },

  writeLog: (entry: LogEntry): void => {
    void ipcRenderer.invoke(IPC_CHANNELS.LOG_WRITE, entry).catch(() => undefined)
  },

  // Text diff
  textDiff: (leftText: string, rightText: string): Promise<IpcResult<TextDiffResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEXT_DIFF, leftText, rightText),

  // SSH
  listSSHConfigs: (): Promise<IpcResult<readonly SSHConfig[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SSH_LIST_CONFIGS),

  saveSSHConfig: (config: SSHConfigInput): Promise<IpcResult<SSHConfig>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SSH_SAVE_CONFIG, config),

  deleteSSHConfig: (id: string): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SSH_DELETE_CONFIG, id),

  testSSHConnection: (id: string): Promise<IpcResult<boolean>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SSH_TEST, id),

  browseSSH: (configId: string, dirPath: string): Promise<IpcResult<readonly FileEntry[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SSH_BROWSE, configId, dirPath),

  // History
  listHistory: (): Promise<IpcResult<readonly CompareHistoryEntry[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.HISTORY_LIST),

  clearHistory: (): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.HISTORY_CLEAR),

  deleteHistory: (id: string): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.HISTORY_DELETE, id),

  // File operations
  showInFolder: (source: SourceConfig, relativePath: string): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_SHOW_IN_FOLDER, source, relativePath),

  renameFile: (source: SourceConfig, oldRelativePath: string, newName: string): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_RENAME, source, oldRelativePath, newName),

  deleteFile: (source: SourceConfig, relativePath: string, isDirectory: boolean): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_DELETE, source, relativePath, isDirectory),

  // Dialog
  selectFolder: (): Promise<IpcResult<string | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FOLDER),

  selectFile: (): Promise<IpcResult<string | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FILE),

  // Dock / open-file
  onOpenPaths: (callback: (paths: readonly string[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, paths: readonly string[]) => callback(paths)
    ipcRenderer.on(IPC_CHANNELS.APP_OPEN_PATHS, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.APP_OPEN_PATHS, listener)
    }
  },

  // Utilities
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
} satisfies SharedAppAPI

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = SharedAppAPI
