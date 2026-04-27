import { describe, expect, it } from 'vitest'
import { buildHunkMetrics, getVisibleHunkWindow } from './file-diff-window'
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
      endIndex: 4,
      topSpacerHeight: 100,
      bottomSpacerHeight: 0,
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