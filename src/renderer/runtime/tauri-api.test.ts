import { describe, expect, it, vi } from 'vitest'
import { listen, type EventCallback, type UnlistenFn } from '@tauri-apps/api/event'
import type { LogEntry } from '@shared/types'
import { tauriApi } from './tauri-api'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}))

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: vi.fn().mockResolvedValue(() => {}),
  })),
}))

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('tauri-api subscribe', () => {
  it('listen 完成后取消订阅会调用 unlisten', async () => {
    const unlisten = vi.fn<UnlistenFn>()
    vi.mocked(listen).mockResolvedValueOnce(unlisten)

    const dispose = tauriApi.onLog(() => {})
    await flush()
    dispose()

    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('清理发生在 listen 完成之前时，注册完成后立即注销（不泄漏监听器）', async () => {
    const unlisten = vi.fn<UnlistenFn>()
    let resolveListen!: (fn: UnlistenFn) => void
    vi.mocked(listen).mockReturnValueOnce(
      new Promise<UnlistenFn>((resolve) => {
        resolveListen = resolve
      }),
    )

    const dispose = tauriApi.onLog(() => {})
    dispose()
    expect(unlisten).not.toHaveBeenCalled()

    resolveListen(unlisten)
    await flush()

    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('将事件负载转发给回调', async () => {
    let handler: EventCallback<LogEntry> | undefined
    vi.mocked(listen).mockImplementationOnce(async (_event, callback) => {
      handler = callback as EventCallback<LogEntry>
      return vi.fn<UnlistenFn>()
    })

    const received: LogEntry[] = []
    tauriApi.onLog((entry) => received.push(entry))
    await flush()

    const entry: LogEntry = {
      timestamp: 1,
      level: 'info',
      scope: 'compare',
      message: 'hello',
    }
    handler?.({ event: 'app:log', id: 1, payload: entry })

    expect(received).toEqual([entry])
  })
})
