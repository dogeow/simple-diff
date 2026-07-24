import type { DiffLine, TextDiffResult } from './types'

const SIMILARITY_THRESHOLD = 0.5
const MAX_SIMILARITY_CHARS = 4000
const MAX_FALLBACK_LINES = 800

/**
 * Patience diff for line-level side-by-side comparison.
 *
 * Anchors on lines that appear exactly once on each side (unique matches),
 * then recurses on the ranges between anchors. Inside ranges with no unique
 * anchors, exact line LCS plus similarity pairing keep related changes on
 * the same visual row instead of blind index zip.
 *
 * Unlike plain LCS alone, patience avoids being hijacked by short,
 * frequently-repeated lines (empty lines, `}`, etc.).
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
      emitSmartPairs(leftSrc, rightSrc, lStart, lEnd, rStart, rEnd, leftOut, rightOut)
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

function isNoiseLine(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length === 0) return true
  if (/^[{}();,[\]]+$/.test(trimmed)) return true
  return trimmed === '});' || trimmed === '})' || trimmed === '};'
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
    if (isNoiseLine(line)) continue
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

function charLcsLength(left: string, right: string): number {
  const a = Array.from(left)
  const b = Array.from(right)
  const m = a.length
  const n = b.length
  if (m === 0 || n === 0) return 0

  // Rolling row DP to keep memory small.
  let prev = new Array<number>(n + 1).fill(0)
  let curr = new Array<number>(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1])
      }
    }
    ;[prev, curr] = [curr, prev]
    curr.fill(0)
  }
  return prev[n]
}

function lineSimilarity(left: string, right: string): number {
  if (left === right) return 1
  if (left.length === 0 || right.length === 0) return 0
  if (left.length > MAX_SIMILARITY_CHARS || right.length > MAX_SIMILARITY_CHARS) {
    const min = Math.min(left.length, right.length)
    const max = Math.max(left.length, right.length)
    let shared = 0
    for (let i = 0; i < min; i++) {
      if (left[i] === right[i]) shared++
      else break
    }
    return shared / max
  }
  const lcs = charLcsLength(left, right)
  return (2 * lcs) / (Array.from(left).length + Array.from(right).length)
}

/**
 * Exact line LCS as absolute source indices within [lStart,lEnd) / [rStart,rEnd).
 */
function findExactLineLcs(
  leftSrc: readonly string[],
  rightSrc: readonly string[],
  lStart: number,
  lEnd: number,
  rStart: number,
  rEnd: number,
): readonly Anchor[] {
  const m = lEnd - lStart
  const n = rEnd - rStart
  if (m === 0 || n === 0) return []

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (leftSrc[lStart + i - 1] === rightSrc[rStart + j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const anchors: Anchor[] = []
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (leftSrc[lStart + i - 1] === rightSrc[rStart + j - 1]) {
      anchors.push({ left: lStart + i - 1, right: rStart + j - 1 })
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }
  anchors.reverse()
  return anchors
}

/**
 * Order-preserving greedy similarity pairs for remaining lines in a gap.
 * Returns anchors as absolute source indices.
 */
function findSimilarityPairs(
  leftSrc: readonly string[],
  rightSrc: readonly string[],
  leftIndices: readonly number[],
  rightIndices: readonly number[],
): readonly Anchor[] {
  if (leftIndices.length === 0 || rightIndices.length === 0) return []

  const pairs: Anchor[] = []
  let minRightPos = 0

  for (const leftIdx of leftIndices) {
    let bestScore = SIMILARITY_THRESHOLD
    let bestRightPos = -1
    for (let p = minRightPos; p < rightIndices.length; p++) {
      const score = lineSimilarity(leftSrc[leftIdx], rightSrc[rightIndices[p]])
      if (score >= bestScore) {
        // Take the highest score; on ties keep the earliest right index.
        if (bestRightPos < 0 || score > bestScore) {
          bestScore = score
          bestRightPos = p
        }
      }
    }
    if (bestRightPos >= 0) {
      pairs.push({ left: leftIdx, right: rightIndices[bestRightPos] })
      minRightPos = bestRightPos + 1
    }
  }

  return pairs
}

function emitMatchedPair(
  leftSrc: readonly string[],
  rightSrc: readonly string[],
  leftIdx: number,
  rightIdx: number,
  leftOut: DiffLine[],
  rightOut: DiffLine[],
): void {
  const leftContent = leftSrc[leftIdx]
  const rightContent = rightSrc[rightIdx]
  if (leftContent === rightContent) {
    leftOut.push({ type: 'equal', lineNumber: leftIdx + 1, content: leftContent })
    rightOut.push({ type: 'equal', lineNumber: rightIdx + 1, content: rightContent })
  } else {
    leftOut.push({ type: 'remove', lineNumber: leftIdx + 1, content: leftContent })
    rightOut.push({ type: 'add', lineNumber: rightIdx + 1, content: rightContent })
  }
}

/**
 * Fallback for ranges without patience anchors:
 * 1) exact line LCS → emit as equal
 * 2) remaining lines → order-preserving similarity pairs
 * 3) leftovers → pure insert/delete with placeholders
 */
function emitSmartPairs(
  leftSrc: readonly string[],
  rightSrc: readonly string[],
  lStart: number,
  lEnd: number,
  rStart: number,
  rEnd: number,
  leftOut: DiffLine[],
  rightOut: DiffLine[],
): void {
  const leftCount = lEnd - lStart
  const rightCount = rEnd - rStart

  // Very large unmatched ranges: fall back to positional zip for performance.
  if (leftCount * rightCount > MAX_FALLBACK_LINES * MAX_FALLBACK_LINES) {
    emitPositionalZip(leftSrc, rightSrc, lStart, lEnd, rStart, rEnd, leftOut, rightOut)
    return
  }

  const exactAnchors = findExactLineLcs(leftSrc, rightSrc, lStart, lEnd, rStart, rEnd)
  const allPairs: Anchor[] = []

  let prevL = lStart
  let prevR = rStart
  for (const anchor of exactAnchors) {
    const leftGap: number[] = []
    const rightGap: number[] = []
    for (let i = prevL; i < anchor.left; i++) leftGap.push(i)
    for (let j = prevR; j < anchor.right; j++) rightGap.push(j)
    allPairs.push(...findSimilarityPairs(leftSrc, rightSrc, leftGap, rightGap))
    allPairs.push(anchor)
    prevL = anchor.left + 1
    prevR = anchor.right + 1
  }

  const leftTail: number[] = []
  const rightTail: number[] = []
  for (let i = prevL; i < lEnd; i++) leftTail.push(i)
  for (let j = prevR; j < rEnd; j++) rightTail.push(j)
  allPairs.push(...findSimilarityPairs(leftSrc, rightSrc, leftTail, rightTail))

  allPairs.sort((a, b) => a.left - b.left || a.right - b.right)

  let cursorL = lStart
  let cursorR = rStart
  for (const pair of allPairs) {
    // Unmatched gap before this pair: positional zip (pure replace stays 1:1).
    emitPositionalZip(leftSrc, rightSrc, cursorL, pair.left, cursorR, pair.right, leftOut, rightOut)
    emitMatchedPair(leftSrc, rightSrc, pair.left, pair.right, leftOut, rightOut)
    cursorL = pair.left + 1
    cursorR = pair.right + 1
  }
  emitPositionalZip(leftSrc, rightSrc, cursorL, lEnd, cursorR, rEnd, leftOut, rightOut)
}

function emitPositionalZip(
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
