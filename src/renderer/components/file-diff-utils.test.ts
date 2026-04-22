import { describe, expect, it } from 'vitest'
import { computeTextDiff } from '../../../shared/text-diff'
import { applyDiffRange, canApplyLine, groupIntoHunks } from './file-diff-utils'

describe('file-diff-utils', () => {
  it('applies a single changed line without copying the whole hunk', () => {
    const leftText = ['alpha', 'beta', 'gamma'].join('\n')
    const rightText = ['alpha', 'BETA', 'gamma'].join('\n')
    const diff = computeTextDiff(leftText, rightText)

    const nextRight = applyDiffRange({
      sourceDiffLines: diff.leftLines,
      targetDiffLines: diff.rightLines,
      targetContent: rightText,
      range: { startIndex: 1, endIndex: 2 },
    })

    expect(nextRight).toBe(leftText)
  })

  it('applies a whole diff hunk as a multi-line block', () => {
    const leftText = ['alpha', 'beta', 'gamma', 'omega'].join('\n')
    const rightText = ['alpha', 'BETA', 'GAMMA', 'omega'].join('\n')
    const diff = computeTextDiff(leftText, rightText)
    const hunk = groupIntoHunks(diff.leftLines, diff.rightLines).find((candidate) => candidate.type === 'diff')

    expect(hunk).toBeTruthy()

    const nextRight = applyDiffRange({
      sourceDiffLines: diff.leftLines,
      targetDiffLines: diff.rightLines,
      targetContent: rightText,
      range: hunk!,
    })

    expect(nextRight).toBe(leftText)
  })

  it('inserts a single missing line back into the target', () => {
    const leftText = ['alpha', 'beta', 'gamma'].join('\n')
    const rightText = ['alpha', 'gamma'].join('\n')
    const diff = computeTextDiff(leftText, rightText)

    const nextRight = applyDiffRange({
      sourceDiffLines: diff.leftLines,
      targetDiffLines: diff.rightLines,
      targetContent: rightText,
      range: { startIndex: 1, endIndex: 2 },
    })

    expect(nextRight).toBe(leftText)
  })

  it('removes a single extra line from the target', () => {
    const leftText = ['alpha', 'gamma'].join('\n')
    const rightText = ['alpha', 'beta', 'gamma'].join('\n')
    const diff = computeTextDiff(leftText, rightText)

    const nextRight = applyDiffRange({
      sourceDiffLines: diff.leftLines,
      targetDiffLines: diff.rightLines,
      targetContent: rightText,
      range: { startIndex: 1, endIndex: 2 },
    })

    expect(nextRight).toBe(leftText)
  })

  it('allows line apply on placeholder rows when the other side has content', () => {
    const diff = computeTextDiff(['alpha', 'gamma'].join('\n'), ['alpha', 'beta', 'gamma'].join('\n'))

    expect(canApplyLine({
      hunkType: 'diff',
      currentLine: diff.leftLines[1],
      otherLine: diff.rightLines[1],
    })).toBe(true)
  })
})