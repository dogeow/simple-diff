import type { AppAPI } from '@shared/app-api'

interface TauriGlobal {
  readonly __TAURI_INTERNALS__?: unknown
}

export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return true
  return typeof (window as unknown as TauriGlobal).__TAURI_INTERNALS__ !== 'undefined'
}

/**
 * 安装 `window.api`。
 * 必须在 import 之前分支：`tauri-api` 在模块求值阶段就会访问 Tauri 全局，
 * 在普通浏览器里加载它会中断整条导入链，React 永远挂载不了。
 */
export async function ensureAppApi(): Promise<AppAPI> {
  if (typeof window === 'undefined') {
    return (await import('./tauri-api')).tauriApi
  }

  if (!window.api) {
    window.api = isTauriRuntime()
      ? (await import('./tauri-api')).tauriApi
      : (await import('./mock-api')).createMockApi()
  }

  return window.api
}
