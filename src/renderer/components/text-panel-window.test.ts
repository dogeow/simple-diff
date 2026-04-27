import { describe, expect, it } from 'vitest'
import { getVisibleRowWindow } from './text-panel-window'

describe('getVisibleRowWindow', () => {
  it('returns an empty window for empty row sets', () => {
    expect(getVisibleRowWindow({
      totalRows: 0,
      scrollTop: 0,
      viewportHeight: 200,
      rowHeight: 20,
      overscanRows: 4,
    })).toEqual({
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    })
  })

  it('adds overscan rows around the visible viewport', () => {
    expect(getVisibleRowWindow({
      totalRows: 100,
      scrollTop: 400,
      viewportHeight: 200,
      rowHeight: 20,
      overscanRows: 4,
    })).toEqual({
      startIndex: 16,
      endIndex: 34,
      topSpacerHeight: 320,
      bottomSpacerHeight: 1320,
    })
  })

  it('clamps the window at the end of the row list', () => {
    expect(getVisibleRowWindow({
      totalRows: 12,
      scrollTop: 180,
      viewportHeight: 120,
      rowHeight: 20,
      overscanRows: 3,
    })).toEqual({
      startIndex: 6,
      endIndex: 12,
      topSpacerHeight: 120,
      bottomSpacerHeight: 0,
    })
  })
})