import { describe, expect, it } from 'vitest'
import { buildHunkMetrics, getVisibleHunkWindow, getVisibleLineWindow } from './file-diff-window'
import type { Hunk } from './file-diff-utils'

const SAMPLE_HUNKS: readonly Hunk[] = [
  { startIndex: 0, endIndex: 5, type: 'equal' },
  { startIndex: 5, endIndex: 7, type: 'diff' },
  { startIndex: 7, endIndex: 11, type: 'equal' },
  { startIndex: 11, endIndex: 14, type: 'diff' },
]

describe('file-diff-window', () => {
  it('builds cumulative top offsets from hunk heights', () => {
    expect(buildHunkMetrics(SAMPLE_HUNKS, 20)).toEqual([
      { hunk: SAMPLE_HUNKS[0], top: 0, height: 100 },
      { hunk: SAMPLE_HUNKS[1], top: 100, height: 40 },
      { hunk: SAMPLE_HUNKS[2], top: 140, height: 80 },
      { hunk: SAMPLE_HUNKS[3], top: 220, height: 60 },
    ])
  })

  it('returns a visible window with top and bottom spacers', () => {
    const metrics = buildHunkMetrics(SAMPLE_HUNKS, 20)

    expect(getVisibleHunkWindow({
      metrics,
      scrollTop: 130,
      viewportHeight: 60,
      overscanHeight: 20,
    })).toEqual({
      startIndex: 1,
      endIndex: 3,
      topSpacerHeight: 100,
      bottomSpacerHeight: 60,
    })
  })

  it('returns an empty window for empty metric lists', () => {
    expect(getVisibleHunkWindow({
      metrics: [],
      scrollTop: 0,
      viewportHeight: 200,
      overscanHeight: 40,
    })).toEqual({
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    })
  })
})

it('clips rows within huge blocks while retaining the full apply range', () => {
  const hunks: Hunk[] = [{ type: 'equal', startIndex: 0, endIndex: 100000 }, { type: 'diff', startIndex: 100000, endIndex: 200000 }]
  const metrics = buildHunkMetrics(hunks, 21)
  for (const scrollTop of [0, 2100000, 4199400]) {
    const window = getVisibleLineWindow({ metrics, scrollTop, viewportHeight: 600, overscanHeight: 336, rowHeight: 21 })
    const count = window.metrics.reduce((sum, metric) => sum + metric.renderEndIndex - metric.renderStartIndex, 0)
    expect(count).toBeLessThan(65)
    expect(window.topSpacerHeight + count * 21 + window.bottomSpacerHeight).toBe(4200000)
    for (const metric of window.metrics) expect(hunks).toContain(metric.hunk)
  }
})
