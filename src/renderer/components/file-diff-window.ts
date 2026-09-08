import type { Hunk } from './file-diff-utils'

export interface HunkMetric {
  readonly hunk: Hunk
  readonly top: number
  readonly height: number
  readonly renderStartIndex?: number
  readonly renderEndIndex?: number
}

export interface VisibleHunkWindow {
  readonly startIndex: number
  readonly endIndex: number
  readonly topSpacerHeight: number
  readonly bottomSpacerHeight: number
}

export function buildHunkMetrics(
  hunks: readonly Hunk[],
  rowHeight: number,
): readonly HunkMetric[] {
  let nextTop = 0

  return hunks.map((hunk) => {
    const height = Math.max(1, hunk.endIndex - hunk.startIndex) * rowHeight
    const metric = {
      hunk,
      top: nextTop,
      height,
    }

    nextTop += height
    return metric
  })
}

export function getVisibleHunkWindow(params: {
  readonly metrics: readonly HunkMetric[]
  readonly scrollTop: number
  readonly viewportHeight: number
  readonly overscanHeight: number
}): VisibleHunkWindow {
  const { metrics, scrollTop, viewportHeight, overscanHeight } = params

  if (metrics.length === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    }
  }

  const safeViewportHeight = Math.max(1, viewportHeight)
  const windowStart = Math.max(0, scrollTop - overscanHeight)
  const windowEnd = scrollTop + safeViewportHeight + overscanHeight

  let startIndex = metrics.findIndex((metric) => metric.top + metric.height > windowStart)
  if (startIndex < 0) {
    startIndex = metrics.length
  }

  let endIndex = startIndex
  while (endIndex < metrics.length && metrics[endIndex].top < windowEnd) {
    endIndex += 1
  }

  const topSpacerHeight = startIndex < metrics.length ? metrics[startIndex].top : 0
  const totalHeight = metrics[metrics.length - 1].top + metrics[metrics.length - 1].height
  const bottomSpacerHeight = endIndex > 0
    ? Math.max(0, totalHeight - (metrics[endIndex - 1].top + metrics[endIndex - 1].height))
    : totalHeight

  return {
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
  }
}

export interface VisibleLineMetric extends HunkMetric {
  readonly renderStartIndex: number
  readonly renderEndIndex: number
}

/** Clip inside hunks. A single equal block may contain millions of lines. */
export function getVisibleLineWindow(params: {
  metrics: readonly HunkMetric[]
  scrollTop: number
  viewportHeight: number
  overscanHeight: number
  rowHeight: number
}): { metrics: readonly VisibleLineMetric[]; topSpacerHeight: number; bottomSpacerHeight: number } {
  const { metrics, rowHeight } = params
  const totalHeight = metrics.length ? metrics[metrics.length - 1].top + metrics[metrics.length - 1].height : 0
  const scrollTop = Math.min(Math.max(0, params.scrollTop), Math.max(0, totalHeight - params.viewportHeight))
  const start = Math.floor(Math.max(0, scrollTop - params.overscanHeight) / rowHeight) * rowHeight
  const end = Math.min(totalHeight, Math.ceil((scrollTop + Math.max(rowHeight, params.viewportHeight) + params.overscanHeight) / rowHeight) * rowHeight)
  let low = 0
  let high = metrics.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (metrics[mid].top + metrics[mid].height <= start) low = mid + 1
    else high = mid
  }
  const visible: VisibleLineMetric[] = []
  for (let i = low; i < metrics.length && metrics[i].top < end; i++) {
    const metric = metrics[i]
    visible.push({
      ...metric,
      renderStartIndex: metric.hunk.startIndex + Math.max(0, Math.floor((start - metric.top) / rowHeight)),
      renderEndIndex: Math.min(metric.hunk.endIndex, metric.hunk.startIndex + Math.ceil((end - metric.top) / rowHeight)),
    })
  }
  return { metrics: visible, topSpacerHeight: start, bottomSpacerHeight: Math.max(0, totalHeight - end) }
}
