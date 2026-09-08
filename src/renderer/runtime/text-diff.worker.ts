import { computeAlignedTextDiff, type ManualAlignmentPair } from '../utils/manual-align'
import { computeTextDiff } from '@shared/text-diff'

self.onmessage = (event: MessageEvent<{ left: string; right: string; alignments?: readonly ManualAlignmentPair[] }>) => {
  try {
    self.postMessage({ success: true, data: event.data.alignments?.length ? computeAlignedTextDiff(event.data.left, event.data.right, event.data.alignments) : computeTextDiff(event.data.left, event.data.right) })
  } catch (error) {
    self.postMessage({ success: false, error: error instanceof Error ? error.message : String(error) })
  }
}
