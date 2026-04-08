import type { DiffLine, TextDiffResult } from '@shared/types'

/**
 * Simple LCS-based line differ.
 * Produces parallel left/right line arrays for side-by-side display.
 */
export function computeTextDiff(leftText: string, rightText: string): TextDiffResult {
  const leftSrc = leftText.split('\n')
  const rightSrc = rightText.split('\n')

  const lcs = computeLCS(leftSrc, rightSrc)

  const leftLines: DiffLine[] = []
  const rightLines: DiffLine[] = []

  let li = 0
  let ri = 0
  let ci = 0

  while (li < leftSrc.length || ri < rightSrc.length) {
    if (ci < lcs.length && li < leftSrc.length && ri < rightSrc.length && leftSrc[li] === lcs[ci] && rightSrc[ri] === lcs[ci]) {
      // equal
      leftLines.push({ type: 'equal', lineNumber: li + 1, content: leftSrc[li] })
      rightLines.push({ type: 'equal', lineNumber: ri + 1, content: rightSrc[ri] })
      li++
      ri++
      ci++
    } else {
      // Consume removed lines from left until we hit the next LCS line
      let addedLeft = false
      let addedRight = false

      while (li < leftSrc.length && (ci >= lcs.length || leftSrc[li] !== lcs[ci])) {
        leftLines.push({ type: 'remove', lineNumber: li + 1, content: leftSrc[li] })
        rightLines.push({ type: 'equal', lineNumber: -1, content: '' }) // placeholder
        li++
        addedLeft = true
      }

      while (ri < rightSrc.length && (ci >= lcs.length || rightSrc[ri] !== lcs[ci])) {
        leftLines.push({ type: 'equal', lineNumber: -1, content: '' }) // placeholder
        rightLines.push({ type: 'add', lineNumber: ri + 1, content: rightSrc[ri] })
        ri++
        addedRight = true
      }
    }
  }

  return { leftLines, rightLines }
}

function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length
  const n = b.length

  // Use O(n) space DP
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to find LCS
  const result: string[] = []
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1])
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  return result
}
