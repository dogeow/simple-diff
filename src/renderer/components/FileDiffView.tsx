import { useMemo, useCallback, useEffect, useRef, useState } from 'react'
import type { DiffTab } from '../stores/app-store'
import { useAppStore } from '../stores/app-store'
import type { DiffLine } from '../../../shared/types'
import { computeTextDiff } from '../../../shared/text-diff'
import { truncatePath } from '../utils/tree-utils'
import { showToast } from '../stores/toast-store'
import ScrollGutter, { type GutterMarker } from './ScrollGutter'
import { applyDiffRange, canApplyLine, groupIntoHunks, type Hunk } from './file-diff-utils'
import { buildHunkMetrics, getVisibleHunkWindow } from './file-diff-window'

interface FileDiffViewProps {
  readonly tab: DiffTab
}

const DIFF_ROW_HEIGHT = 21
const DIFF_OVERSCAN_ROWS = 16

export default function FileDiffView({ tab }: FileDiffViewProps) {
  const updateDiffTab = useAppStore((s) => s.updateDiffTab)
  const hasDiffTabSession = useAppStore((s) => s.hasDiffTabSession)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  const handleScroll = useCallback((source: 'left' | 'right') => {
    if (syncing.current) return
    syncing.current = true
    const from = source === 'left' ? leftRef.current : rightRef.current
    const to = source === 'left' ? rightRef.current : leftRef.current
    if (from && to) {
      setScrollTop(from.scrollTop)
      to.scrollTop = from.scrollTop
    }
    requestAnimationFrame(() => { syncing.current = false })
  }, [])

  useEffect(() => {
    const element = leftRef.current
    if (!element) {
      return
    }

    const updateViewport = () => {
      setViewportHeight(element.clientHeight)
      setScrollTop(element.scrollTop)
    }

    updateViewport()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(updateViewport)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const hunks = useMemo(() => {
    if (!tab.diffResult) return []
    return groupIntoHunks(tab.diffResult.leftLines, tab.diffResult.rightLines)
  }, [tab.diffResult])
  const hunkMetrics = useMemo(() => buildHunkMetrics(hunks, DIFF_ROW_HEIGHT), [hunks])
  const visibleHunkWindow = useMemo(() => getVisibleHunkWindow({
    metrics: hunkMetrics,
    scrollTop,
    viewportHeight,
    overscanHeight: DIFF_ROW_HEIGHT * DIFF_OVERSCAN_ROWS,
  }), [hunkMetrics, scrollTop, viewportHeight])
  const visibleHunkMetrics = useMemo(
    () => hunkMetrics.slice(visibleHunkWindow.startIndex, visibleHunkWindow.endIndex),
    [hunkMetrics, visibleHunkWindow.endIndex, visibleHunkWindow.startIndex],
  )
  const totalDiffHeight = useMemo(
    () => hunkMetrics.length > 0
      ? hunkMetrics[hunkMetrics.length - 1].top + hunkMetrics[hunkMetrics.length - 1].height
      : 0,
    [hunkMetrics],
  )

  const isModified = tab.leftContent !== tab.originalLeftContent || tab.rightContent !== tab.originalRightContent

  const diffHunkMetrics = useMemo(
    () => hunkMetrics.filter((metric) => metric.hunk.type === 'diff'),
    [hunkMetrics],
  )

  const diffSummary = useMemo(() => {
    if (!tab.diffResult) return { added: 0, removed: 0, hunks: 0 }
    let added = 0
    let removed = 0
    for (const line of tab.diffResult.leftLines) {
      if (line.type === 'remove') removed += 1
    }
    for (const line of tab.diffResult.rightLines) {
      if (line.type === 'add') added += 1
    }
    return { added, removed, hunks: diffHunkMetrics.length }
  }, [tab.diffResult, diffHunkMetrics.length])

  const diffMarkers = useMemo((): readonly GutterMarker[] => {
    if (totalDiffHeight === 0) return []
    return diffHunkMetrics.map((metric) => ({
        start: metric.top / totalDiffHeight,
        height: metric.height / totalDiffHeight,
      }))
  }, [diffHunkMetrics, totalDiffHeight])

  const scrollToDiff = useCallback((direction: 'next' | 'prev') => {
    const container = leftRef.current
    if (!container || diffHunkMetrics.length === 0) return

    const currentTop = container.scrollTop
    let target = diffHunkMetrics[0]

    if (direction === 'next') {
      target = diffHunkMetrics.find((metric) => metric.top > currentTop + 4) ?? diffHunkMetrics[diffHunkMetrics.length - 1]
    } else {
      target = [...diffHunkMetrics].reverse().find((metric) => metric.top < currentTop - 4) ?? diffHunkMetrics[0]
    }

    container.scrollTo({ top: target.top, behavior: 'smooth' })
    if (rightRef.current) {
      rightRef.current.scrollTo({ top: target.top, behavior: 'smooth' })
    }
  }, [diffHunkMetrics])

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

      const shouldGoNext = (event.metaKey || event.ctrlKey)
        && event.altKey
        && !event.shiftKey
        && event.key === 'ArrowDown'
      const shouldGoPrev = (event.metaKey || event.ctrlKey)
        && event.altKey
        && !event.shiftKey
        && event.key === 'ArrowUp'

      if (shouldGoNext || shouldGoPrev) {
        event.preventDefault()
        scrollToDiff(shouldGoPrev ? 'prev' : 'next')
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
      showToast({
        tone: 'success',
        message: side === 'left' ? '已保存左侧' : '已保存右侧',
        description: tab.fileName,
      })
    } else {
      showToast({
        tone: 'error',
        message: '保存失败',
        description: result.error ?? '未知错误',
      })
    }
  }, [tab, hasDiffTabSession, updateDiffTab])

  if (tab.loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-neutral-400">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
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
        <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/5 px-3 py-1.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            已修改
          </span>
          {tab.leftContent !== tab.originalLeftContent && tab.leftSource && (
            <button
              onClick={() => handleSave('left')}
              className="rounded-md bg-blue-600 px-2 py-0.5 text-xs font-medium text-white shadow-sm hover:bg-blue-500"
            >
              保存左侧
            </button>
          )}
          {tab.rightContent !== tab.originalRightContent && tab.rightSource && (
            <button
              onClick={() => handleSave('right')}
              className="rounded-md bg-blue-600 px-2 py-0.5 text-xs font-medium text-white shadow-sm hover:bg-blue-500"
            >
              保存右侧
            </button>
          )}
        </div>
      )}

      {/* Path headers (sticky) */}
      <div className="flex shrink-0 border-b border-neutral-800 bg-neutral-850">
        <PathHeaderCell side="left" path={tab.leftFullPath} />
        <PathHeaderCell side="right" path={tab.rightFullPath} />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-800 bg-neutral-900/70 px-3 py-1.5 text-[11px] text-neutral-500">
        <button
          onClick={() => scrollToDiff('prev')}
          disabled={diffSummary.hunks === 0}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800/70 px-2 py-0.5 text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-800/70"
        >
          上一个差异
        </button>
        <button
          onClick={() => scrollToDiff('next')}
          disabled={diffSummary.hunks === 0}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800/70 px-2 py-0.5 text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-800/70"
        >
          下一个差异
        </button>
        {diffSummary.hunks > 0 ? (
          <span className="inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900/40 px-2 py-0.5">
            <span className="inline-flex items-center gap-1 text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="tabular-nums">+{diffSummary.added}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-rose-300">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              <span className="tabular-nums">−{diffSummary.removed}</span>
            </span>
            <span className="text-neutral-500">·</span>
            <span className="tabular-nums text-neutral-400">{diffSummary.hunks} 个差异块</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            两侧内容一致
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-neutral-600">
          <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">⌘/Ctrl</kbd>
          <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">⌥/Alt</kbd>
          <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">↑</kbd>
          上一个
          <span className="mx-1 text-neutral-700">·</span>
          <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">⌘/Ctrl</kbd>
          <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">⌥/Alt</kbd>
          <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">↓</kbd>
          下一个
        </span>
      </div>

      {/* Diff content — two panels with synchronized scroll */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div ref={leftRef} className="flex-1 overflow-auto font-mono text-xs" onScroll={() => handleScroll('left')}>
          {visibleHunkWindow.topSpacerHeight > 0 && (
            <div aria-hidden="true" style={{ height: `${visibleHunkWindow.topSpacerHeight}px` }} />
          )}
          {visibleHunkMetrics.map((metric) => (
            <HunkBlock
              key={metric.hunk.startIndex}
              hunk={metric.hunk}
              lines={leftLines}
              otherLines={rightLines}
              side="left"
              onApplyHunk={() => handleApplyRange(metric.hunk, 'left-to-right')}
              onApplyLine={(lineIndex) => handleApplyRange({ startIndex: lineIndex, endIndex: lineIndex + 1 }, 'left-to-right')}
            />
          ))}
          {visibleHunkWindow.bottomSpacerHeight > 0 && (
            <div aria-hidden="true" style={{ height: `${visibleHunkWindow.bottomSpacerHeight}px` }} />
          )}
        </div>

        {/* Center gutter with scroll indicator and diff markers */}
        <ScrollGutter scrollRef={leftRef} markers={diffMarkers} />

        {/* Right panel */}
        <div ref={rightRef} className="flex-1 overflow-auto font-mono text-xs" onScroll={() => handleScroll('right')}>
          {visibleHunkWindow.topSpacerHeight > 0 && (
            <div aria-hidden="true" style={{ height: `${visibleHunkWindow.topSpacerHeight}px` }} />
          )}
          {visibleHunkMetrics.map((metric) => (
            <HunkBlock
              key={metric.hunk.startIndex}
              hunk={metric.hunk}
              lines={rightLines}
              otherLines={leftLines}
              side="right"
              onApplyHunk={() => handleApplyRange(metric.hunk, 'right-to-left')}
              onApplyLine={(lineIndex) => handleApplyRange({ startIndex: lineIndex, endIndex: lineIndex + 1 }, 'right-to-left')}
            />
          ))}
          {visibleHunkWindow.bottomSpacerHeight > 0 && (
            <div aria-hidden="true" style={{ height: `${visibleHunkWindow.bottomSpacerHeight}px` }} />
          )}
        </div>
      </div>
    </div>
  )
}

interface PathHeaderCellProps {
  readonly side: 'left' | 'right'
  readonly path: string
}

function PathHeaderCell({ side, path }: PathHeaderCellProps) {
  const display = path || '(不存在)'
  const badgeClass = side === 'left'
    ? 'bg-sky-500/15 text-sky-300'
    : 'bg-violet-500/15 text-violet-300'
  const borderClass = side === 'left' ? 'border-r border-neutral-800' : ''

  const handleCopy = async () => {
    if (!path) return
    try {
      await navigator.clipboard.writeText(path)
      showToast({ tone: 'success', message: '已复制路径', description: path })
    } catch (error) {
      showToast({ tone: 'error', message: '复制失败', description: String(error) })
    }
  }

  return (
    <div
      className={`group flex flex-1 items-center gap-1.5 truncate px-3 py-1.5 text-xs text-neutral-400 ${borderClass}`}
      title={display}
    >
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${badgeClass}`}>
        {side === 'left' ? 'L' : 'R'}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono">{truncatePath(display)}</span>
      {path && (
        <button
          onClick={handleCopy}
          aria-label="复制完整路径"
          title="复制完整路径"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-500 opacity-0 transition-opacity hover:bg-neutral-700/50 hover:text-neutral-200 group-hover:opacity-100"
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      )}
    </div>
  )
}

const LINE_BG: Record<DiffLine['type'], string> = {
  equal: '',
  add: 'bg-emerald-500/10',
  remove: 'bg-rose-500/10',
}

const LINE_EDGE: Record<DiffLine['type'], string> = {
  equal: 'border-l-2 border-l-transparent',
  add: 'border-l-2 border-l-emerald-500/50',
  remove: 'border-l-2 border-l-rose-500/50',
}

interface HunkBlockProps {
  readonly hunk: Hunk
  readonly lines: readonly DiffLine[]
  readonly otherLines: readonly DiffLine[]
  readonly side: 'left' | 'right'
  readonly onApplyHunk: () => void
  readonly onApplyLine: (lineIndex: number) => void
}

function HunkBlock({ hunk, lines, otherLines, side, onApplyHunk, onApplyLine }: HunkBlockProps) {
  const hunkLines = lines.slice(hunk.startIndex, hunk.endIndex)
  const isMultiLineDiff = hunk.endIndex - hunk.startIndex > 1

  return (
    <div className="group relative">
      {hunk.type === 'diff' && (
        <button
          onClick={onApplyHunk}
          className="absolute z-20 inline-flex items-center gap-0.5 rounded-md bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 shadow-sm transition-all hover:bg-blue-500 group-hover:opacity-100"
          style={side === 'left' ? { right: 4, top: 2 } : { left: 4, top: 2 }}
          title={side === 'left' ? '整块应用到右侧' : '整块应用到左侧'}
        >
          {isMultiLineDiff ? (side === 'left' ? '整块→' : '←整块') : (side === 'left' ? '→' : '←')}
        </button>
      )}
      {hunkLines.map((line, i) => (
        <div
          key={hunk.startIndex + i}
          className={`group/line flex w-max min-w-full border-b border-neutral-800/30 ${LINE_BG[line.type]} ${LINE_EDGE[line.type]}`}
          style={{ height: `${DIFF_ROW_HEIGHT}px` }}
        >
          <span className="inline-block w-12 shrink-0 select-none border-r border-neutral-800/60 px-2 py-0.5 text-right tabular-nums text-neutral-600">
            {line.lineNumber >= 0 ? line.lineNumber : ''}
          </span>
          {canApplyLine({
            hunkType: hunk.type,
            currentLine: line,
            otherLine: otherLines[hunk.startIndex + i],
          }) && (
            <button
              onClick={() => onApplyLine(hunk.startIndex + i)}
              className="mx-1 my-0.5 inline-flex shrink-0 items-center justify-center rounded bg-blue-600 px-1 text-[10px] font-medium text-white opacity-0 shadow-sm transition-opacity hover:bg-blue-500 group-hover/line:opacity-100"
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
