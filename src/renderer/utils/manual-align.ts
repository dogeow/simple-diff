import type { DiffLine, TextDiffResult } from '../../../shared/types'
import { computeTextDiff } from '../../../shared/text-diff'

export type TextDiffSide = 'left' | 'right'

export interface ManualAlignRequest {
  readonly side: TextDiffSide
  readonly lineNumber: number | null
}

export interface ManualAlignmentPair {
  readonly leftLineNumber: number
  readonly rightLineNumber: number
}

function createPlaceholderLine(): DiffLine {
  return { type: 'equal', lineNumber: -1, content: '' }
}

export function normalizeManualAlignments(
  alignments: readonly ManualAlignmentPair[],
): readonly ManualAlignmentPair[] {
  return [...alignments].sort((left, right) => {
    if (left.leftLineNumber !== right.leftLineNumber) {
      return left.leftLineNumber - right.leftLineNumber
    }
    return left.rightLineNumber - right.rightLineNumber
  })
}

export function addManualAlignment(
  alignments: readonly ManualAlignmentPair[],
  nextAlignment: ManualAlignmentPair,
): { readonly alignments: readonly ManualAlignmentPair[]; readonly error: string | null } {
  if (nextAlignment.leftLineNumber <= 0 || nextAlignment.rightLineNumber <= 0) {
    return { alignments, error: '只能对齐有实际内容的行' }
  }

  const next = normalizeManualAlignments([
    ...alignments.filter((alignment) => (
      alignment.leftLineNumber !== nextAlignment.leftLineNumber
      && alignment.rightLineNumber !== nextAlignment.rightLineNumber
    )),
    nextAlignment,
  ])

  for (let index = 1; index < next.length; index += 1) {
    if (next[index - 1].rightLineNumber >= next[index].rightLineNumber) {
      return {
        alignments,
        error: '手动对齐不能交叉，请先清除冲突的对齐锚点',
      }
    }
  }

  return { alignments: next, error: null }
}

function diffSegment(
  leftSrc: readonly string[],
  rightSrc: readonly string[],
  leftOffset: number,
  rightOffset: number,
): TextDiffResult {
  if (leftSrc.length === 0 && rightSrc.length === 0) {
    return { leftLines: [], rightLines: [] }
  }

  if (leftSrc.length === 0) {
    return {
      leftLines: rightSrc.map(() => createPlaceholderLine()),
      rightLines: rightSrc.map((content, index) => ({
        type: 'add' as const,
        lineNumber: rightOffset + index + 1,
        content,
      })),
    }
  }

  if (rightSrc.length === 0) {
    return {
      leftLines: leftSrc.map((content, index) => ({
        type: 'remove' as const,
        lineNumber: leftOffset + index + 1,
        content,
      })),
      rightLines: leftSrc.map(() => createPlaceholderLine()),
    }
  }

  const raw = computeTextDiff(leftSrc.join('\n'), rightSrc.join('\n'))
  return {
    leftLines: raw.leftLines.map((line) => (
      line.lineNumber > 0
        ? { ...line, lineNumber: line.lineNumber + leftOffset }
        : line
    )),
    rightLines: raw.rightLines.map((line) => (
      line.lineNumber > 0
        ? { ...line, lineNumber: line.lineNumber + rightOffset }
        : line
    )),
  }
}

export function computeAlignedTextDiff(
  leftText: string,
  rightText: string,
  alignments: readonly ManualAlignmentPair[],
): TextDiffResult {
  const leftSrc = leftText.split('\n')
  const rightSrc = rightText.split('\n')

  const validAnchors = normalizeManualAlignments(alignments).filter((anchor) => (
    anchor.leftLineNumber >= 1
    && anchor.leftLineNumber <= leftSrc.length
    && anchor.rightLineNumber >= 1
    && anchor.rightLineNumber <= rightSrc.length
  ))

  if (validAnchors.length === 0) {
    return computeTextDiff(leftText, rightText)
  }

  const leftLines: DiffLine[] = []
  const rightLines: DiffLine[] = []

  let leftCursor = 0
  let rightCursor = 0

  for (const anchor of validAnchors) {
    const leftAnchorIndex = anchor.leftLineNumber - 1
    const rightAnchorIndex = anchor.rightLineNumber - 1

    if (leftAnchorIndex < leftCursor || rightAnchorIndex < rightCursor) {
      continue
    }

    const segment = diffSegment(
      leftSrc.slice(leftCursor, leftAnchorIndex),
      rightSrc.slice(rightCursor, rightAnchorIndex),
      leftCursor,
      rightCursor,
    )
    leftLines.push(...segment.leftLines)
    rightLines.push(...segment.rightLines)

    const leftContent = leftSrc[leftAnchorIndex] ?? ''
    const rightContent = rightSrc[rightAnchorIndex] ?? ''
    const contentsMatch = leftContent === rightContent

    leftLines.push({
      type: contentsMatch ? 'equal' : 'remove',
      lineNumber: anchor.leftLineNumber,
      content: leftContent,
    })
    rightLines.push({
      type: contentsMatch ? 'equal' : 'add',
      lineNumber: anchor.rightLineNumber,
      content: rightContent,
    })

    leftCursor = leftAnchorIndex + 1
    rightCursor = rightAnchorIndex + 1
  }

  const tail = diffSegment(
    leftSrc.slice(leftCursor),
    rightSrc.slice(rightCursor),
    leftCursor,
    rightCursor,
  )
  leftLines.push(...tail.leftLines)
  rightLines.push(...tail.rightLines)

  return { leftLines, rightLines }
}

export function getDisplayRowIndexFromTextOffset(text: string, offset: number): number {
  const safeOffset = Math.max(0, Math.min(offset, text.length))
  let rowIndex = 0

  for (let index = 0; index < safeOffset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      rowIndex += 1
    }
  }

  return rowIndex
}
