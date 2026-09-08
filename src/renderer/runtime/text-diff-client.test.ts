import { afterEach, expect, it, vi } from 'vitest'
import { computeTextDiffAsync } from './text-diff-client'

class TestWorker {
  static instances: TestWorker[] = []
  onmessage?: (event: { data: unknown }) => void
  onerror?: () => void
  terminate = vi.fn()
  postMessage = vi.fn()
  constructor() { TestWorker.instances.push(this) }
  finish() { this.onmessage?.({ data: { success: true, data: { leftLines: [], rightLines: [] } } }) }
}
afterEach(() => { vi.unstubAllGlobals(); TestWorker.instances = [] })

it('bounds concurrency and terminates running work on cancellation', async () => {
  vi.stubGlobal('Worker', TestWorker)
  const abort = new AbortController()
  const first = computeTextDiffAsync('a', 'b', abort.signal)
  const second = computeTextDiffAsync('c', 'd')
  const third = computeTextDiffAsync('e', 'f')
  expect(TestWorker.instances).toHaveLength(2)
  abort.abort()
  expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce()
  expect(TestWorker.instances).toHaveLength(3)
  TestWorker.instances[1].finish()
  TestWorker.instances[2].finish()
  expect((await first).success).toBe(false)
  expect((await second).success).toBe(true)
  expect((await third).success).toBe(true)
})

it('removes a cancelled queued job without starting another worker for it', async () => {
  vi.stubGlobal('Worker', TestWorker)
  const first = computeTextDiffAsync('a', 'b')
  const second = computeTextDiffAsync('c', 'd')
  const controller = new AbortController()
  const third = computeTextDiffAsync('e', 'f', controller.signal)
  controller.abort()
  TestWorker.instances[0].finish()
  TestWorker.instances[1].finish()
  await Promise.all([first, second, third])
  expect(TestWorker.instances).toHaveLength(2)
})
