import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_CHANNELS } from '../../shared/types'
import type {
  CompareEntry,
  CompareRequest,
  CompareResult,
  LogEntry,
  SourceConfig,
  FileEntry,
  IpcResult,
  SSHConfig,
  SSHConfigInput,
  TextDiffResult,
  CompareHistoryEntry,
} from '../../shared/types'

const api = {
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

  cancelCompare: (): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.COMPARE_CANCEL),

  onScanComplete: (callback: (compareId: string, entries: readonly CompareEntry[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, compareId: string, entries: readonly CompareEntry[]) =>
      callback(compareId, entries)
    ipcRenderer.on(IPC_CHANNELS.COMPARE_SCAN_COMPLETE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.COMPARE_SCAN_COMPLETE, listener)
  },

  onEntryUpdate: (callback: (compareId: string, entry: CompareEntry) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, compareId: string, entry: CompareEntry) =>
      callback(compareId, entry)
    ipcRenderer.on(IPC_CHANNELS.COMPARE_ENTRY_UPDATE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.COMPARE_ENTRY_UPDATE, listener)
  },

  // Log
  onLog: (callback: (entry: LogEntry) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: LogEntry) => callback(entry)
    ipcRenderer.on(IPC_CHANNELS.LOG, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.LOG, listener)
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
  showInFolder: (filePath: string): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_SHOW_IN_FOLDER, filePath),

  renameFile: (oldPath: string, newName: string): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_RENAME, oldPath, newName),

  deleteFile: (filePath: string, isDirectory: boolean): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_DELETE, filePath, isDirectory),

  // Dialog
  selectFolder: (): Promise<IpcResult<string | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FOLDER),

  selectFile: (): Promise<IpcResult<string | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FILE),

  // Utilities
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
} as const

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
