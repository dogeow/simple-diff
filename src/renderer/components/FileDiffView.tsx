import { useMemo, useCallback, useEffect, useRef } from 'react'
import type { DiffTab } from '../stores/app-store'
import { useAppStore } from '../stores/app-store'
import type { DiffLine } from '../../../shared/types'
import { computeTextDiff } from '../../../shared/text-diff'
import { truncatePath } from '../utils/tree-utils'
import ScrollGutter, { type GutterMarker } from './ScrollGutter'
import { applyDiffRange, canApplyLine, groupIntoHunks, type Hunk } from './file-diff-utils'

interface FileDiffViewProps {
  readonly tab: DiffTab
}

export default function FileDiffView({ tab }: FileDiffViewProps) {
  const updateDiffTab = useAppStore((s) => s.updateDiffTab)
  const hasDiffTabSession = useAppStore((s) => s.hasDiffTabSession)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)
  const diffHunkRefs = useRef<Record<number, HTMLDivElement | null>>({})

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

  const diffMarkers = useMemo((): readonly GutterMarker[] => {
    if (!tab.diffResult) return []
    const totalLines = Math.max(tab.diffResult.leftLines.length, tab.diffResult.rightLines.length)
    if (totalLines === 0) return []
    return hunks
      .filter((h) => h.type === 'diff')
      .map((h) => ({
        start: h.startIndex / totalLines,
        height: (h.endIndex - h.startIndex) / totalLines,
      }))
  }, [hunks, tab.diffResult])

  const diffHunks = useMemo(
    () => hunks.filter((hunk) => hunk.type === 'diff'),
    [hunks],
  )

  const scrollToDiff = useCallback((direction: 'next' | 'prev') => {
    const container = leftRef.current
    if (!container || diffHunks.length === 0) return

    const containerRect = container.getBoundingClientRect()
    const tops = diffHunks
      .map((hunk) => {
        const el = diffHunkRefs.current[hunk.startIndex]
        if (!el) return null
        // Calculate position relative to container's scroll origin
        const elRect = el.getBoundingClientRect()
        const top = elRect.top - containerRect.top + container.scrollTop
        return { startIndex: hunk.startIndex, top }
      })
      .filter((item): item is { startIndex: number; top: number } => item != null)

    if (tops.length === 0) return

    const currentTop = container.scrollTop
    let target = tops[0]

    if (direction === 'next') {
      target = tops.find((item) => item.top > currentTop + 4) ?? tops[tops.length - 1]
    } else {
      target = [...tops].reverse().find((item) => item.top < currentTop - 4) ?? tops[0]
    }

    container.scrollTo({ top: target.top, behavior: 'smooth' })
    if (rightRef.current) {
      rightRef.current.scrollTo({ top: target.top, behavior: 'smooth' })
    }
  }, [diffHunks])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.isContentEditable
      )) {
        return
      }

      if (event.key === 'F7') {
        event.preventDefault()
        scrollToDiff(event.shiftKey ? 'prev' : 'next')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [scrollToDiff])

  const handleApplyRange = useCallback(
    (range: { startIndex: number; endIndex: number }, direction: 'left-to-right' | 'right-to-left') => {
      const latestTab = useAppStore
        .getState()
        .diffTabs
        .find((candidate) => candidate.id === tab.id && candidate.sessionId === tab.sessionId)

      if (!latestTab?.diffResult) return

      const { leftLines, rightLines } = latestTab.diffResult
      const srcDiffLines = direction === 'left-to-right' ? leftLines : rightLines
      const targetDiffLines = direction === 'left-to-right' ? rightLines : leftLines
      const targetContent = direction === 'left-to-right' ? latestTab.rightContent : latestTab.leftContent

      const newTargetContent = applyDiffRange({
        sourceDiffLines: srcDiffLines,
        targetDiffLines,
        targetContent,
        range,
      })
      const newLeft = direction === 'left-to-right' ? latestTab.leftContent : newTargetContent
      const newRight = direction === 'left-to-right' ? newTargetContent : latestTab.rightContent
      const nextDiff = computeTextDiff(newLeft, newRight)

      updateDiffTab(tab.id, {
        leftContent: newLeft,
        rightContent: newRight,
        diffResult: nextDiff,
      })
    },
    [tab.id, tab.sessionId, updateDiffTab],
  )

  const handleSave = useCallback(async (side: 'left' | 'right') => {
    const source = side === 'left' ? tab.leftSource : tab.rightSource
    const fullPath = side === 'left' ? tab.leftFullPath : tab.rightFullPath
    const content = side === 'left' ? tab.leftContent : tab.rightContent

    if (!source) return

    const result = await window.api.writeText(source, fullPath, content)
    if (!hasDiffTabSession(tab.id, tab.sessionId)) {
      return
    }
    if (result.success) {
      updateDiffTab(tab.id, {
        ...(side === 'left'
          ? { originalLeftContent: content }
          : { originalRightContent: content }),
      })
    }
  }, [tab, hasDiffTabSession, updateDiffTab])

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

      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-900/70 px-3 py-1 text-[11px] text-neutral-500">
        <button
          onClick={() => scrollToDiff('prev')}
          className="rounded bg-neutral-700 px-2 py-0.5 text-neutral-300 hover:bg-neutral-600"
        >
          上一个差异
        </button>
        <button
          onClick={() => scrollToDiff('next')}
          className="rounded bg-neutral-700 px-2 py-0.5 text-neutral-300 hover:bg-neutral-600"
        >
          下一个差异
        </button>
        <span className="ml-auto">快捷键: Shift+F7 上一个, F7 下一个</span>
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
              otherLines={rightLines}
              side="left"
              onApplyHunk={() => handleApplyRange(hunk, 'left-to-right')}
              onApplyLine={(lineIndex) => handleApplyRange({ startIndex: lineIndex, endIndex: lineIndex + 1 }, 'left-to-right')}
              containerRef={(element) => {
                diffHunkRefs.current[hunk.startIndex] = element
              }}
            />
          ))}
        </div>

        {/* Center gutter with scroll indicator and diff markers */}
        <ScrollGutter scrollRef={leftRef} markers={diffMarkers} />

        {/* Right panel */}
        <div ref={rightRef} className="flex-1 overflow-auto font-mono text-xs" onScroll={() => handleScroll('right')}>
          {hunks.map((hunk) => (
            <HunkBlock
              key={hunk.startIndex}
              hunk={hunk}
              lines={rightLines}
              otherLines={leftLines}
              side="right"
              onApplyHunk={() => handleApplyRange(hunk, 'right-to-left')}
              onApplyLine={(lineIndex) => handleApplyRange({ startIndex: lineIndex, endIndex: lineIndex + 1 }, 'right-to-left')}
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
  readonly otherLines: readonly DiffLine[]
  readonly side: 'left' | 'right'
  readonly onApplyHunk: () => void
  readonly onApplyLine: (lineIndex: number) => void
  readonly containerRef?: (element: HTMLDivElement | null) => void
}

function HunkBlock({ hunk, lines, otherLines, side, onApplyHunk, onApplyLine, containerRef }: HunkBlockProps) {
  const hunkLines = lines.slice(hunk.startIndex, hunk.endIndex)
  const isMultiLineDiff = hunk.endIndex - hunk.startIndex > 1

  return (
    <div ref={containerRef} className="group relative">
      {hunk.type === 'diff' && (
        <button
          onClick={onApplyHunk}
          className="absolute top-0 z-20 rounded bg-blue-600/80 px-1 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
          style={side === 'left' ? { right: 2, top: 2 } : { left: 2, top: 2 }}
          title={side === 'left' ? '整块应用到右侧' : '整块应用到左侧'}
        >
          {isMultiLineDiff ? (side === 'left' ? '整块→' : '←整块') : (side === 'left' ? '→' : '←')}
        </button>
      )}
      {hunkLines.map((line, i) => (
        <div
          key={hunk.startIndex + i}
          className={`group/line flex min-w-full w-max border-b border-neutral-800/30 ${LINE_BG[line.type]}`}
        >
          <span className="inline-block w-12 shrink-0 select-none border-r border-neutral-800 px-2 py-0.5 text-right text-neutral-500">
            {line.lineNumber >= 0 ? line.lineNumber : ''}
          </span>
          {canApplyLine({
            hunkType: hunk.type,
            currentLine: line,
            otherLine: otherLines[hunk.startIndex + i],
          }) && (
            <button
              onClick={() => onApplyLine(hunk.startIndex + i)}
              className="mx-1 my-0.5 shrink-0 rounded bg-blue-600/70 px-1 py-0 text-[10px] text-white opacity-0 transition-opacity group-hover/line:opacity-100"
              title={side === 'left' ? '仅应用当前行到右侧' : '仅应用当前行到左侧'}
            >
              {side === 'left' ? '→' : '←'}
            </button>
          )}
          <pre className="min-w-0 whitespace-pre px-2 py-0.5">
            {line.content}
          </pre>
        </div>
      ))}
    </div>
  )
}
