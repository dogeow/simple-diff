import { describe, expect, it } from 'vitest'
import {
  addManualAlignment,
  computeAlignedTextDiff,
  getDisplayRowIndexFromTextOffset,
} from './manual-align'

describe('addManualAlignment', () => {
  it('replaces existing anchors that reuse the same line number', () => {
    const result = addManualAlignment(
      [
        { leftLineNumber: 2, rightLineNumber: 4 },
        { leftLineNumber: 6, rightLineNumber: 7 },
      ],
      { leftLineNumber: 2, rightLineNumber: 5 },
    )

    expect(result.error).toBeNull()
    expect(result.alignments).toEqual([
      { leftLineNumber: 2, rightLineNumber: 5 },
      { leftLineNumber: 6, rightLineNumber: 7 },
    ])
  })

  it('rejects crossing anchors', () => {
    const result = addManualAlignment(
      [{ leftLineNumber: 2, rightLineNumber: 4 }],
      { leftLineNumber: 5, rightLineNumber: 3 },
    )

    expect(result.error).toBe('手动对齐不能交叉，请先清除冲突的对齐锚点')
    expect(result.alignments).toEqual([{ leftLineNumber: 2, rightLineNumber: 4 }])
  })
})

describe('computeAlignedTextDiff', () => {
  it('forces anchored lines onto the same display row and diffs segments independently', () => {
    const left = ['a1', 'a2', 'target', 'a4', 'a5'].join('\n')
    const right = ['b1', 'b2', 'b3', 'b4', 'target', 'b6', 'b7'].join('\n')

    const result = computeAlignedTextDiff(left, right, [
      { leftLineNumber: 3, rightLineNumber: 5 },
    ])

    expect(result.leftLines.length).toBe(result.rightLines.length)

    const anchorLeftIndex = result.leftLines.findIndex((line) => line.lineNumber === 3)
    const anchorRightIndex = result.rightLines.findIndex((line) => line.lineNumber === 5)
    expect(anchorLeftIndex).toBeGreaterThanOrEqual(0)
    expect(anchorLeftIndex).toBe(anchorRightIndex)
    expect(result.leftLines[anchorLeftIndex].content).toBe('target')
    expect(result.rightLines[anchorRightIndex].content).toBe('target')
  })

  it('aligns multiple anchors on their respective display rows', () => {
    const left = ['L1', 'L2', 'anchorA', 'L4', 'anchorB', 'L6'].join('\n')
    const right = ['R1', 'R2', 'R3', 'R4', 'anchorA', 'R6', 'R7', 'anchorB', 'R9'].join('\n')

    const result = computeAlignedTextDiff(left, right, [
      { leftLineNumber: 3, rightLineNumber: 5 },
      { leftLineNumber: 5, rightLineNumber: 8 },
    ])

    const firstLeft = result.leftLines.findIndex((line) => line.lineNumber === 3)
    const firstRight = result.rightLines.findIndex((line) => line.lineNumber === 5)
    const secondLeft = result.leftLines.findIndex((line) => line.lineNumber === 5)
    const secondRight = result.rightLines.findIndex((line) => line.lineNumber === 8)

    expect(firstLeft).toBe(firstRight)
    expect(secondLeft).toBe(secondRight)
    expect(result.leftLines.length).toBe(result.rightLines.length)
  })

  it('falls back to plain diff when no anchors are provided', () => {
    const left = 'a\nb'
    const right = 'a\nc'

    const result = computeAlignedTextDiff(left, right, [])

    expect(result.leftLines.map((line) => line.content)).toEqual(['a', 'b'])
    expect(result.rightLines.map((line) => line.content)).toEqual(['a', 'c'])
  })
})

describe('getDisplayRowIndexFromTextOffset', () => {
  it('maps a caret offset to the visible row index', () => {
    const text = ['alpha', '', 'gamma'].join('\n')

    expect(getDisplayRowIndexFromTextOffset(text, 0)).toBe(0)
    expect(getDisplayRowIndexFromTextOffset(text, 6)).toBe(1)
    expect(getDisplayRowIndexFromTextOffset(text, text.length)).toBe(2)
  })
})
