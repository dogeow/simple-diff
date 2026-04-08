import { useMemo, useCallback, useRef } from 'react'
import type { DiffTab } from '../stores/app-store'
import { useAppStore } from '../stores/app-store'
import type { DiffLine } from '../../../shared/types'
import { truncatePath } from '../utils/tree-utils'
import ScrollGutter from './ScrollGutter'

interface Hunk {
  readonly startIndex: number
  readonly endIndex: number
  readonly type: 'equal' | 'diff'
}

function groupIntoHunks(leftLines: readonly DiffLine[], rightLines: readonly DiffLine[]): readonly Hunk[] {
  const hunks: Hunk[] = []
  const len = Math.max(leftLines.length, rightLines.length)
  let i = 0

  while (i < len) {
    const lType = leftLines[i]?.type ?? 'equal'
    const rType = rightLines[i]?.type ?? 'equal'
    const isEqual = lType === 'equal' && rType === 'equal'
    const type = isEqual ? 'equal' : 'diff'
    const start = i

    while (i < len) {
      const lt = leftLines[i]?.type ?? 'equal'
      const rt = rightLines[i]?.type ?? 'equal'
      const curIsEqual = lt === 'equal' && rt === 'equal'
      if (curIsEqual !== isEqual) break
      i++
    }

    hunks.push({ startIndex: start, endIndex: i, type })
  }

  return hunks
}

interface FileDiffViewProps {
  readonly tab: DiffTab
}

export default function FileDiffView({ tab }: FileDiffViewProps) {
  const updateDiffTab = useAppStore((s) => s.updateDiffTab)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)

  const handleScroll = useCallback((source: 'left' | 'right') => {
    if (syncing.current) return
    syncing.current = true
    const from = source === 'left' ? leftRef.current : rightRef.current
    const to = source === 'left' ? rightRef.current : leftRef.current
    if (from && to) {
      to.scrollTop = from.scrollTop
    }
    requestAnimationFrame(() => { syncing.current = false })
  }, [])

  const hunks = useMemo(() => {
    if (!tab.diffResult) return []
    return groupIntoHunks(tab.diffResult.leftLines, tab.diffResult.rightLines)
  }, [tab.diffResult])

  const isModified = tab.leftContent !== tab.originalLeftContent || tab.rightContent !== tab.originalRightContent

  const handleCopyHunk = useCallback(
    async (hunk: Hunk, direction: 'left-to-right' | 'right-to-left') => {
      if (!tab.diffResult) return

      const { leftLines, rightLines } = tab.diffResult

      // Collect source lines (real content, not placeholder)
      const sourceLines: string[] = []
      const srcDiffLines = direction === 'left-to-right' ? leftLines : rightLines
      for (let i = hunk.startIndex; i < hunk.endIndex; i++) {
        if (srcDiffLines[i].lineNumber >= 0) {
          sourceLines.push(srcDiffLines[i].content)
        }
      }

      // Find target range
      const targetDiffLines = direction === 'left-to-right' ? rightLines : leftLines
      const targetContent = direction === 'left-to-right' ? tab.rightContent : tab.leftContent
      const targetAllLines = targetContent.split('\n')

      let firstLineNum = -1
      let lastLineNum = -1
      for (let i = hunk.startIndex; i < hunk.endIndex; i++) {
        if (targetDiffLines[i].lineNumber >= 0) {
          if (firstLineNum < 0) firstLineNum = targetDiffLines[i].lineNumber
          lastLineNum = targetDiffLines[i].lineNumber
        }
      }

      if (firstLineNum >= 0) {
        targetAllLines.splice(firstLineNum - 1, lastLineNum - firstLineNum + 1, ...sourceLines)
      } else {
        // Insert after previous real line
        let insertAt = 0
        for (let i = hunk.startIndex - 1; i >= 0; i--) {
          if (targetDiffLines[i].lineNumber >= 0) {
            insertAt = targetDiffLines[i].lineNumber
            break
          }
        }
        targetAllLines.splice(insertAt, 0, ...sourceLines)
      }

      const newTargetContent = targetAllLines.join('\n')
      const newLeft = direction === 'left-to-right' ? tab.leftContent : newTargetContent
      const newRight = direction === 'left-to-right' ? newTargetContent : tab.rightContent

      // Re-diff
      const result = await window.api.textDiff(newLeft, newRight)
      if (result.success && result.data) {
        updateDiffTab(tab.id, {
          leftContent: newLeft,
          rightContent: newRight,
          diffResult: result.data,
        })
      }
    },
    [tab, updateDiffTab],
  )

  const handleSave = useCallback(async (side: 'left' | 'right') => {
    const source = side === 'left' ? tab.leftSource : tab.rightSource
    const fullPath = side === 'left' ? tab.leftFullPath : tab.rightFullPath
    const content = side === 'left' ? tab.leftContent : tab.rightContent

    if (!source) return

    const result = await window.api.writeText(source, fullPath, content)
    if (result.success) {
      updateDiffTab(tab.id, {
        ...(side === 'left'
          ? { originalLeftContent: content }
          : { originalRightContent: content }),
      })
    }
  }, [tab, updateDiffTab])

  if (tab.loading) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-400">
        加载中...
      </div>
    )
  }

  if (!tab.diffResult) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        无法加载文件内容
      </div>
    )
  }

  const { leftLines, rightLines } = tab.diffResult

  return (
    <div className="flex h-full flex-col">
      {/* Save bar */}
      {isModified && (
        <div className="flex items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-3 py-1.5">
          <span className="text-xs text-yellow-400">已修改</span>
          {tab.leftContent !== tab.originalLeftContent && tab.leftSource && (
            <button
              onClick={() => handleSave('left')}
              className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-500"
            >
              保存左侧
            </button>
          )}
          {tab.rightContent !== tab.originalRightContent && tab.rightSource && (
            <button
              onClick={() => handleSave('right')}
              className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-500"
            >
              保存右侧
            </button>
          )}
        </div>
      )}

      {/* Path headers (sticky) */}
      <div className="flex shrink-0 border-b border-neutral-700 bg-neutral-800">
        <div className="flex-1 truncate border-r border-neutral-700 px-3 py-1 text-xs text-neutral-400" title={tab.leftFullPath || '(不存在)'}>
          左侧 — {truncatePath(tab.leftFullPath || '(不存在)')}
        </div>
        <div className="flex-1 truncate px-3 py-1 text-xs text-neutral-400" title={tab.rightFullPath || '(不存在)'}>
          右侧 — {truncatePath(tab.rightFullPath || '(不存在)')}
        </div>
      </div>

      {/* Diff content — two panels with synchronized scroll */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div ref={leftRef} className="flex-1 overflow-auto font-mono text-xs" onScroll={() => handleScroll('left')}>
          {hunks.map((hunk) => (
            <HunkBlock
              key={hunk.startIndex}
              hunk={hunk}
              lines={leftLines}
              side="left"
              onCopy={() => handleCopyHunk(hunk, 'left-to-right')}
            />
          ))}
        </div>

        {/* Center gutter with scroll indicator */}
        <ScrollGutter scrollRef={leftRef} />

        {/* Right panel */}
        <div ref={rightRef} className="flex-1 overflow-auto font-mono text-xs" onScroll={() => handleScroll('right')}>
          {hunks.map((hunk) => (
            <HunkBlock
              key={hunk.startIndex}
              hunk={hunk}
              lines={rightLines}
              side="right"
              onCopy={() => handleCopyHunk(hunk, 'right-to-left')}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const LINE_BG: Record<DiffLine['type'], string> = {
  equal: '',
  add: 'bg-green-900/30',
  remove: 'bg-red-900/30',
}

interface HunkBlockProps {
  readonly hunk: Hunk
  readonly lines: readonly DiffLine[]
  readonly side: 'left' | 'right'
  readonly onCopy: () => void
}

function HunkBlock({ hunk, lines, side, onCopy }: HunkBlockProps) {
  const hunkLines = lines.slice(hunk.startIndex, hunk.endIndex)

  return (
    <div className="group relative">
      {hunk.type === 'diff' && (
        <button
          onClick={onCopy}
          className="absolute top-0 z-20 rounded bg-blue-600/80 px-1 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
          style={side === 'left' ? { right: 2, top: 2 } : { left: 2, top: 2 }}
          title={side === 'left' ? '复制到右侧 →' : '← 复制到左侧'}
        >
          {side === 'left' ? '→' : '←'}
        </button>
      )}
      {hunkLines.map((line, i) => (
        <div
          key={hunk.startIndex + i}
          className={`flex border-b border-neutral-800/30 ${LINE_BG[line.type]}`}
        >
          <span className="inline-block w-12 shrink-0 select-none border-r border-neutral-800 px-2 py-0.5 text-right text-neutral-500">
            {line.lineNumber >= 0 ? line.lineNumber : ''}
          </span>
          <pre className="flex-1 whitespace-pre overflow-x-auto px-2 py-0.5">
            {line.content}
          </pre>
        </div>
      ))}
    </div>
  )
}
