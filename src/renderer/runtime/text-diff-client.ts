import { computeAlignedTextDiff, type ManualAlignmentPair } from '../utils/manual-align'
import { computeTextDiff } from '@shared/text-diff'
import type { IpcResult, TextDiffResult } from '@shared/types'

type Result = IpcResult<TextDiffResult>
const queue: Array<() => void> = []
let active = 0

/** At most two computations; abort terminates CPU work as well as ignoring its result. */
export function computeTextDiffAsync(left: string, right: string, signal?: AbortSignal, alignments?: readonly ManualAlignmentPair[]): Promise<Result> {
  if (left.length + right.length > 32 * 1024 * 1024) return Promise.resolve({ success: false, error: '文本过大，请缩小范围后再对比。' })
  if (signal?.aborted) return Promise.resolve({ success: false, error: '对比已取消' })
  if (typeof Worker === 'undefined') {
    // Node tests / environments without worker support.
    return Promise.resolve({ success: true, data: alignments?.length ? computeAlignedTextDiff(left, right, alignments) : computeTextDiff(left, right) })
  }
  return new Promise((resolve) => {
    let worker: Worker | null = null
    let started = false
    let finished = false
    const finish = (result: Result) => {
      if (finished) return
      finished = true
      worker?.terminate()
      signal?.removeEventListener('abort', abort)
      if (started) active--
      else {
        const index = queue.indexOf(start)
        if (index >= 0) queue.splice(index, 1)
      }
      resolve(result)
      if (active < 2) queue.shift()?.()
    }
    const abort = () => finish({ success: false, error: '对比已取消' })
    const start = () => {
      started = true
      active++
      try {
        worker = new Worker(new URL('./text-diff.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<Result>) => finish(event.data)
        worker.onerror = () => finish({ success: false, error: '文本差异计算失败' })
        worker.onmessageerror = () => finish({ success: false, error: '无法读取差异结果' })
        worker.postMessage({ left, right, alignments })
      } catch (error) {
        finish({ success: false, error: error instanceof Error ? error.message : String(error) })
      }
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (active < 2) start()
    else queue.push(start)
  })
}
