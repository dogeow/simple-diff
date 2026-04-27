import type { Hunk } from './file-diff-utils'

export interface HunkMetric {
  readonly hunk: Hunk
  readonly top: number
  readonly height: number
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

  const safeViewportHeight = Math.max(viewportHeight, metrics[0]?.height ?? 0)
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