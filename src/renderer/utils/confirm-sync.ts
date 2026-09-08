import type { StartSyncRequest } from '../../../shared/types'
import { useUIStore } from '../stores/ui-store'

export function confirmSync(request: StartSyncRequest): Promise<boolean> {
  if (useUIStore.getState().pendingSync) return Promise.resolve(false)
  return new Promise((resolve) => useUIStore.getState().setPendingSync({ request, resolve }))
}
