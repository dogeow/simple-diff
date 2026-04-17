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

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
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
): InlineSegmentMaps {
  const len = Math.min(leftLines.length, rightLines.length)
  const leftMap = new Map<number, readonly InlineSegment[]>()
  const rightMap = new Map<number, readonly InlineSegment[]>()

  let i = 0
  while (i < len) {
    const removes: number[] = []
    const adds: number[] = []

    while (i < len && leftLines[i].type === 'remove') {
      removes.push(i)
      i++
    }
    while (i < len && rightLines[i].type === 'add') {
      adds.push(i)
      i++
    }

    if (removes.length === 0 && adds.length === 0) {
      i++
      continue
    }

    const pairCount = Math.min(removes.length, adds.length)
    for (let k = 0; k < pairCount; k++) {
      const lIdx = removes[k]
      const rIdx = adds[k]
      const inline = computeInlineDiff(leftLines[lIdx].content, rightLines[rIdx].content)
      leftMap.set(lIdx, inline.left)
      rightMap.set(rIdx, inline.right)
    }
  }

  return { left: leftMap, right: rightMap }
}
