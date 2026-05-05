import type { AppAPI } from '@shared/app-api'
import { browserApi } from './browser-api'

export function ensureAppApi(): AppAPI {
  if (typeof window === 'undefined') {
    return browserApi
  }

  if (!window.api) {
    window.api = browserApi
  }

  return window.api
}