import type { AppAPI } from '@shared/app-api'
import { tauriApi } from './tauri-api'

export function ensureAppApi(): AppAPI {
  if (typeof window === 'undefined') {
    return tauriApi
  }

  if (!window.api) {
    window.api = tauriApi
  }

  return window.api
}
