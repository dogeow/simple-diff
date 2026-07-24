import type { AppAPI } from '@shared/app-api'

declare global {
  interface Window {
    api: AppAPI
  }
}

export {}
