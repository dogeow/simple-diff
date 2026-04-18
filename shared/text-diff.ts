import type { DiffLine, TextDiffResult } from './types'

/**
 * Patience diff for line-level side-by-side comparison.
 *
 * Anchors on lines that appear exactly once on each side (unique matches),
 * then recurses on the ranges between anchors. Inside ranges with no unique
 * anchors, removes and adds are paired row-by-row so that related changes
 * stay on the same visual row.
 *
 * Unlike plain LCS, this avoids being hijacked by short, frequently-repeated
 * lines (empty lines, `}`, etc.) that often cause mis-alignment in code diffs.
 */
export function computeTextDiff(leftText: string, rightText: string): TextDiffResult {
  const leftSrc = leftText.split('\n')
  const rightSrc = rightText.split('\n')

  const leftLines: DiffLine[] = []
  const rightLines: DiffLine[] = []

  diffRange(leftSrc, rightSrc, 0, leftSrc.length, 0, rightSrc.length, leftLines, rightLines)

  return { leftLines, rightLines }
}

interface Anchor {
  readonly left: number
  readonly right: number
}

function diffRange(
  leftSrc: readonly string[],
  rightSrc: readonly string[],
  lStartIn: number,
  lEndIn: number,
  rStartIn: number,
  rEndIn: number,
  leftOut: DiffLine[],
  rightOut: DiffLine[],
): void {
  let lStart = lStartIn
  let lEnd = lEndIn
  let rStart = rStartIn
  let rEnd = rEndIn

  // Trim leading equal lines (emit immediately).
  while (lStart < lEnd && rStart < rEnd && leftSrc[lStart] === rightSrc[rStart]) {
    leftOut.push({ type: 'equal', lineNumber: lStart + 1, content: leftSrc[lStart] })
    rightOut.push({ type: 'equal', lineNumber: rStart + 1, content: rightSrc[rStart] })
    lStart++
    rStart++
  }

  // Trim trailing equal lines (defer emission until after the middle).
  const trailingLeft: DiffLine[] = []
  const trailingRight: DiffLine[] = []
  while (lStart < lEnd && rStart < rEnd && leftSrc[lEnd - 1] === rightSrc[rEnd - 1]) {
    lEnd--
    rEnd--
    trailingLeft.push({ type: 'equal', lineNumber: lEnd + 1, content: leftSrc[lEnd] })
    trailingRight.push({ type: 'equal', lineNumber: rEnd + 1, content: rightSrc[rEnd] })
  }
  trailingLeft.reverse()
  trailingRight.reverse()

  if (lStart >= lEnd && rStart >= rEnd) {
    // Nothing in the middle.
  } else if (lStart >= lEnd) {
    for (let i = rStart; i < rEnd; i++) {
      leftOut.push({ type: 'equal', lineNumber: -1, content: '' })
      rightOut.push({ type: 'add', lineNumber: i + 1, content: rightSrc[i] })
    }
  } else if (rStart >= rEnd) {
    for (let i = lStart; i < lEnd; i++) {
      leftOut.push({ type: 'remove', lineNumber: i + 1, content: leftSrc[i] })
      rightOut.push({ type: 'equal', lineNumber: -1, content: '' })
    }
  } else {
    const anchors = findPatienceAnchors(leftSrc, rightSrc, lStart, lEnd, rStart, rEnd)

    if (anchors.length === 0) {
      emitPairs(leftSrc, rightSrc, lStart, lEnd, rStart, rEnd, leftOut, rightOut)
    } else {
      let prevL = lStart
      let prevR = rStart
      for (const anchor of anchors) {
        diffRange(leftSrc, rightSrc, prevL, anchor.left, prevR, anchor.right, leftOut, rightOut)
        leftOut.push({ type: 'equal', lineNumber: anchor.left + 1, content: leftSrc[anchor.left] })
        rightOut.push({ type: 'equal', lineNumber: anchor.right + 1, content: rightSrc[anchor.right] })
        prevL = anchor.left + 1
        prevR = anchor.right + 1
      }
      diffRange(leftSrc, rightSrc, prevL, lEnd, prevR, rEnd, leftOut, rightOut)
    }
  }

  for (const line of trailingLeft) leftOut.push(line)
  for (const line of trailingRight) rightOut.push(line)
}

function findPatienceAnchors(
  leftSrc: readonly string[],
  rightSrc: readonly string[],
  lStart: number,
  lEnd: number,
  rStart: number,
  rEnd: number,
): readonly Anchor[] {
  const leftCounts = new Map<string, number>()
  const rightCounts = new Map<string, number>()
  const leftIndex = new Map<string, number>()
  const rightIndex = new Map<string, number>()

  for (let i = lStart; i < lEnd; i++) {
    const line = leftSrc[i]
    leftCounts.set(line, (leftCounts.get(line) ?? 0) + 1)
    if (!leftIndex.has(line)) leftIndex.set(line, i)
  }
  for (let j = rStart; j < rEnd; j++) {
    const line = rightSrc[j]
    rightCounts.set(line, (rightCounts.get(line) ?? 0) + 1)
    if (!rightIndex.has(line)) rightIndex.set(line, j)
  }

  const candidates: Anchor[] = []
  for (const [line, leftCount] of leftCounts) {
    if (leftCount === 1 && rightCounts.get(line) === 1) {
      candidates.push({
        left: leftIndex.get(line) as number,
        right: rightIndex.get(line) as number,
      })
    }
  }

  candidates.sort((a, b) => a.left - b.left)

  return longestIncreasingSubsequence(candidates)
}

/**
 * DP-based LIS by `right` index over candidates pre-sorted by `left` index.
 *
 * O(n^2) — chosen over O(n log n) patience sort because we need a stable
 * tie-break: when multiple chains have equal max length, prefer the one whose
 * earliest element has the smallest `left` index. The patience-sort variant
 * aggressively replaces tails and can drop such earlier anchors.
 */
function longestIncreasingSubsequence(candidates: readonly Anchor[]): readonly Anchor[] {
  if (candidates.length === 0) return []

  const lengths: number[] = new Array(candidates.length).fill(1)
  const predecessors: number[] = new Array(candidates.length).fill(-1)

  for (let i = 1; i < candidates.length; i++) {
    for (let j = 0; j < i; j++) {
      if (candidates[j].right < candidates[i].right && lengths[j] + 1 > lengths[i]) {
        lengths[i] = lengths[j] + 1
        predecessors[i] = j
      }
    }
  }

  // Pick the chain with max length; on ties, `<` keeps the earliest-left tip
  // (candidates are sorted by left, so earliest `i` wins).
  let maxLen = 0
  let maxIdx = -1
  for (let i = 0; i < candidates.length; i++) {
    if (lengths[i] > maxLen) {
      maxLen = lengths[i]
      maxIdx = i
    }
  }

  const result: Anchor[] = []
  let k = maxIdx
  while (k >= 0) {
    result.unshift(candidates[k])
    k = predecessors[k]
  }

  return result
}

function emitPairs(
  leftSrc: readonly string[],
  rightSrc: readonly string[],
  lStart: number,
  lEnd: number,
  rStart: number,
  rEnd: number,
  leftOut: DiffLine[],
  rightOut: DiffLine[],
): void {
  const removeCount = lEnd - lStart
  const addCount = rEnd - rStart
  const maxCount = Math.max(removeCount, addCount)

  for (let k = 0; k < maxCount; k++) {
    if (k < removeCount) {
      leftOut.push({
        type: 'remove',
        lineNumber: lStart + k + 1,
        content: leftSrc[lStart + k],
      })
    } else {
      leftOut.push({ type: 'equal', lineNumber: -1, content: '' })
    }
    if (k < addCount) {
      rightOut.push({
        type: 'add',
        lineNumber: rStart + k + 1,
        content: rightSrc[rStart + k],
      })
    } else {
      rightOut.push({ type: 'equal', lineNumber: -1, content: '' })
    }
  }
}
