import type { DiffLine } from '../../../shared/types'

export interface DiffRange {
  readonly startIndex: number
  readonly endIndex: number
}

export interface Hunk extends DiffRange {
  readonly type: 'equal' | 'diff'
}

export function canApplyLine(params: {
  readonly hunkType: Hunk['type']
  readonly currentLine: DiffLine
  readonly otherLine?: DiffLine
}): boolean {
  const { hunkType, currentLine, otherLine } = params
  if (hunkType !== 'diff') return false
  return currentLine.lineNumber >= 0 || (otherLine?.lineNumber ?? -1) >= 0
}

export function groupIntoHunks(leftLines: readonly DiffLine[], rightLines: readonly DiffLine[]): readonly Hunk[] {
  const hunks: Hunk[] = []
  const len = Math.max(leftLines.length, rightLines.length)
  let index = 0

  while (index < len) {
    const leftType = leftLines[index]?.type ?? 'equal'
    const rightType = rightLines[index]?.type ?? 'equal'
    const isEqual = leftType === 'equal' && rightType === 'equal'
    const startIndex = index

    while (index < len) {
      const currentLeftType = leftLines[index]?.type ?? 'equal'
      const currentRightType = rightLines[index]?.type ?? 'equal'
      const currentIsEqual = currentLeftType === 'equal' && currentRightType === 'equal'
      if (currentIsEqual !== isEqual) break
      index++
    }

    hunks.push({
      startIndex,
      endIndex: index,
      type: isEqual ? 'equal' : 'diff',
    })
  }

  return hunks
}

export function applyDiffRange(params: {
  readonly sourceDiffLines: readonly DiffLine[]
  readonly targetDiffLines: readonly DiffLine[]
  readonly targetContent: string
  readonly range: DiffRange
}): string {
  const { sourceDiffLines, targetDiffLines, targetContent, range } = params
  const targetAllLines = targetContent.split('\n')
  const sourceLines: string[] = []

  for (let index = range.startIndex; index < range.endIndex; index++) {
    const line = sourceDiffLines[index]
    if (line && line.lineNumber >= 0) {
      sourceLines.push(line.content)
    }
  }

  let firstLineNumber = -1
  let lastLineNumber = -1

  for (let index = range.startIndex; index < range.endIndex; index++) {
    const line = targetDiffLines[index]
    if (line && line.lineNumber >= 0) {
      if (firstLineNumber < 0) firstLineNumber = line.lineNumber
      lastLineNumber = line.lineNumber
    }
  }

  if (firstLineNumber >= 0) {
    targetAllLines.splice(firstLineNumber - 1, lastLineNumber - firstLineNumber + 1, ...sourceLines)
    return targetAllLines.join('\n')
  }

  let insertAt = 0
  for (let index = range.startIndex - 1; index >= 0; index--) {
    const line = targetDiffLines[index]
    if (line && line.lineNumber >= 0) {
      insertAt = line.lineNumber
      break
    }
  }

  targetAllLines.splice(insertAt, 0, ...sourceLines)
  return targetAllLines.join('\n')
}