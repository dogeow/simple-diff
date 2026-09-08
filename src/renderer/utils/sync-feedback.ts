import { showToast } from '../stores/toast-store'

export async function reportSyncResult<T>(action: () => Promise<import('../../../shared/types').IpcResult<T>>) {
  try {
    const response = await action()
    if (!response.success) showToast({ tone: 'error', message: '同步操作失败', description: response.error ?? '未知错误' })
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    showToast({ tone: 'error', message: '同步操作失败', description: message })
    return { success: false as const, error: message }
  }
}
