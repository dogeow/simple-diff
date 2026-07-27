import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { showToast, useToastStore } from '../stores/toast-store'

const UPDATE_TOAST_ID = 'app-update'
let startupCheck: Promise<Update | null> | null = null

function updateToast(input: {
  tone: 'info' | 'success' | 'error'
  message: string
  description?: string
  action?: { label: string; onClick: () => void }
}): void {
  const store = useToastStore.getState()
  if (store.toasts.some((toast) => toast.id === UPDATE_TOAST_ID)) {
    store.update(UPDATE_TOAST_ID, input)
    return
  }
  showToast({ id: UPDATE_TOAST_ID, duration: 0, ...input })
}

async function installUpdate(update: Update): Promise<void> {
  let downloaded = 0
  let total = 0

  updateToast({ tone: 'info', message: '正在下载更新…' })
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? 0
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength
      const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0
      updateToast({ tone: 'info', message: `正在下载更新… ${percent}%` })
    } else if (event.event === 'Finished') {
      updateToast({ tone: 'success', message: '更新已安装，正在重新启动…' })
    }
  })
  await relaunch()
}

async function runStartupCheck(): Promise<Update | null> {
  let update: Update | null
  try {
    update = await check()
  } catch {
    return null
  }
  if (!update) return null

  updateToast({
    tone: 'info',
    message: `发现新版本 ${update.version}`,
    description: '可以立即下载并安装更新。',
    action: {
      label: '立即更新',
      onClick: () => {
        void installUpdate(update).catch((error) => {
          updateToast({
            tone: 'error',
            message: '更新失败',
            description: error instanceof Error ? error.message : String(error),
          })
        })
      },
    },
  })
  return update
}

export function checkForUpdate(): Promise<Update | null> {
  startupCheck ??= runStartupCheck()
  return startupCheck
}
