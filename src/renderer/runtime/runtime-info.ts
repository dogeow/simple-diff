import type { AppRuntimeInfo } from '@shared/app-api'

const DEFAULT_RUNTIME_INFO: AppRuntimeInfo = {
  mode: 'electron',
  supportsSftp: true,
  supportsHistory: true,
  supportsSync: true,
  supportsNativeFolderSelection: true,
  supportsDirectoryDragDrop: true,
  supportsWriteBack: true,
}

export function getRuntimeInfo(): AppRuntimeInfo {
  if (typeof window === 'undefined' || !window.api) {
    return DEFAULT_RUNTIME_INFO
  }

  return {
    ...DEFAULT_RUNTIME_INFO,
    ...window.api.runtime,
  }
}