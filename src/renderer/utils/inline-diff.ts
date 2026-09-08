import type { DiffLine } from '../../../shared/types'

export interface InlineSegment {
  readonly text: string
  readonly emphasis: boolean
}

export interface InlineSegmentMaps {
  readonly left: ReadonlyMap<number, readonly InlineSegment[]>
  readonly right: ReadonlyMap<number, readonly InlineSegment[]>
}

const MAX_LINE_LENGTH = 4000
const MAX_LCS_CELLS = 250_000

function pushChar(segs: InlineSegment[], char: string, emphasis: boolean): void {
  const last = segs[segs.length - 1]
  if (last && last.emphasis === emphasis) {
    segs[segs.length - 1] = { text: last.text + char, emphasis }
  } else {
    segs.push({ text: char, emphasis })
  }
}

export function computeInlineDiff(
  left: string,
  right: string,
  maxCells = MAX_LCS_CELLS,
): { readonly left: readonly InlineSegment[]; readonly right: readonly InlineSegment[] } {
  if (left.length > MAX_LINE_LENGTH || right.length > MAX_LINE_LENGTH) {
    return {
      left: left ? [{ text: left, emphasis: true }] : [],
      right: right ? [{ text: right, emphasis: true }] : [],
    }
  }

  const a = Array.from(left)
  const b = Array.from(right)
  const m = a.length
  const n = b.length

  // Preserve shared edges even when a very long changed middle exceeds the budget.
  if (m * n > maxCells) {
    let prefix = 0
    while (prefix < m && prefix < n && a[prefix] === b[prefix]) prefix++
    let suffix = 0
    while (suffix < m - prefix && suffix < n - prefix && a[m - suffix - 1] === b[n - suffix - 1]) suffix++
    const segments = (chars: string[]): InlineSegment[] => [
      { text: chars.slice(0, prefix).join(''), emphasis: false },
      { text: chars.slice(prefix, chars.length - suffix).join(''), emphasis: true },
      { text: chars.slice(chars.length - suffix).join(''), emphasis: false },
    ].filter((segment) => segment.text.length > 0)
    return { left: segments(a), right: segments(b) }
  }
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const ops: { type: 'equal' | 'remove' | 'add'; char: string }[] = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: 'equal', char: a[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'add', char: b[j - 1] })
      j--
    } else {
      ops.push({ type: 'remove', char: a[i - 1] })
      i--
    }
  }
  ops.reverse()

  const leftSegs: InlineSegment[] = []
  const rightSegs: InlineSegment[] = []
  for (const op of ops) {
    if (op.type === 'equal') {
      pushChar(leftSegs, op.char, false)
      pushChar(rightSegs, op.char, false)
    } else if (op.type === 'remove') {
      pushChar(leftSegs, op.char, true)
    } else {
      pushChar(rightSegs, op.char, true)
    }
  }

  return { left: leftSegs, right: rightSegs }
}

/**
 * Walk the parallel diff line arrays, pair consecutive remove rows with
 * consecutive add rows in each diff group, and compute char-level segments
 * for each pair.
 */
export function buildInlineSegments(
  leftLines: readonly DiffLine[],
  rightLines: readonly DiffLine[],
  range: { startIndex: number; endIndex: number } = { startIndex: 0, endIndex: leftLines.length },
): InlineSegmentMaps {
  const len = Math.min(leftLines.length, rightLines.length)
  const leftMap = new Map<number, readonly InlineSegment[]>()
  const rightMap = new Map<number, readonly InlineSegment[]>()

  let remainingCells = 2_000_000
  let i = Math.min(range.startIndex, len)
  while (i > 0 && !(leftLines[i - 1].type === 'equal' && rightLines[i - 1].type === 'equal')) i--
  while (i < len && i < range.endIndex) {
    const removes: number[] = []
    const adds: number[] = []

    while (
      i < len
      && !(leftLines[i].type === 'equal' && rightLines[i].type === 'equal')
    ) {
      if (leftLines[i].type === 'remove') {
        removes.push(i)
      }
      if (rightLines[i].type === 'add') {
        adds.push(i)
      }
      i++
    }

    const pairCount = Math.min(removes.length, adds.length)
    for (let k = 0; k < pairCount; k++) {
      const lIdx = removes[k]
      const rIdx = adds[k]
      if ((lIdx < range.startIndex || lIdx >= range.endIndex) && (rIdx < range.startIndex || rIdx >= range.endIndex)) continue
      const cells = leftLines[lIdx].content.length * rightLines[rIdx].content.length
      const budget = Math.min(MAX_LCS_CELLS, remainingCells)
      const inline = computeInlineDiff(leftLines[lIdx].content, rightLines[rIdx].content, budget)
      if (cells <= budget) remainingCells -= cells
      leftMap.set(lIdx, inline.left)
      rightMap.set(rIdx, inline.right)
    }

    if (removes.length === 0 && adds.length === 0) {
      i++
    }
  }

  return { left: leftMap, right: rightMap }
}
