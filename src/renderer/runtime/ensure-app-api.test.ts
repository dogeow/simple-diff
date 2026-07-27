// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { ensureAppApi, isTauriRuntime } from './ensure-app-api'

describe('ensureAppApi', () => {
  it('没有 Tauri 全局时安装浏览器预览用的 mock api', async () => {
    expect(isTauriRuntime()).toBe(false)

    const api = await ensureAppApi()

    expect(api.runtime.mode).toBe('web')
    expect(window.api).toBe(api)
  })

  it('重复调用不会替换已安装的实现', async () => {
    const first = await ensureAppApi()
    const second = await ensureAppApi()

    expect(second).toBe(first)
  })
})
