import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, CircleCheck, Copy, RefreshCw, Save } from 'lucide-react'
import { useMemo, useCallback, useEffect, useRef, useState } from 'react'
import {
  Badge,
  Button,
  DiffGutter,
  EmptyState,
  IconButton,
  Spinner,
  SplitPane,
  StatusDot,
  type DiffKind,
} from './ui'
import { SHORTCUT } from '../hooks/shortcuts'
import type { DiffTab } from '../stores/app-store'
import { useAppStore } from '../stores/app-store'
import type { DiffLine } from '../../../shared/types'
import { computeTextDiff } from '../../../shared/text-diff'
import { truncatePath } from '../utils/tree-utils'
import { showToast } from '../stores/toast-store'
import ScrollGutter, { type GutterMarker } from './ScrollGutter'
import { applyDiffRange, canApplyLine, groupIntoHunks, type Hunk } from './file-diff-utils'
import { buildHunkMetrics, getVisibleHunkWindow } from './file-diff-window'
import { loadDiffTabContents } from '../utils/diff-tab-loader'
import { buildInlineSegments, type InlineSegment } from '../utils/inline-diff'
import { copyPathToClipboard, saveDiffTabSide } from '../utils/command-actions'

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
  const inlineSegments = useMemo(() => {
    if (!tab.diffResult) return null
    return buildInlineSegments(tab.diffResult.leftLines, tab.diffResult.rightLines)
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

  const leftDirty = tab.leftContent !== tab.originalLeftContent
  const rightDirty = tab.rightContent !== tab.originalRightContent
  const isModified = leftDirty || rightDirty

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

  // 实现住在 `utils/command-actions.ts`：`⌘K` 的「保存左侧 / 保存右侧」调的是同一个
  // 函数，两处的写盘、会话校验和 toast 不会分叉（chunk 9）。
  const handleSave = useCallback((side: 'left' | 'right') => saveDiffTabSide(tab, side), [tab])

  const handleReload = useCallback(async () => {
    updateDiffTab(tab.id, {
      loading: true,
      loadError: null,
    })

    const loaded = await loadDiffTabContents({
      leftSource: tab.leftSource,
      rightSource: tab.rightSource,
      leftFullPath: tab.leftFullPath,
      rightFullPath: tab.rightFullPath,
      readLeft: tab.hasLeftFile,
      readRight: tab.hasRightFile,
    })

    if (!hasDiffTabSession(tab.id, tab.sessionId)) {
      return
    }

    updateDiffTab(tab.id, {
      leftContent: loaded.leftContent,
      rightContent: loaded.rightContent,
      originalLeftContent: loaded.leftContent,
      originalRightContent: loaded.rightContent,
      diffResult: loaded.diffResult,
      loadError: loaded.loadError,
      loading: false,
    })

    if (loaded.loadError) {
      showToast({
        tone: 'error',
        message: '文件内容读取失败',
        description: tab.fileName,
      })
    }
  }, [hasDiffTabSession, tab, updateDiffTab])

  if (tab.loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-fg-muted">
        <Spinner size="sm" />
        加载中...
      </div>
    )
  }

  if (!tab.diffResult) {
    if (tab.loadError) {
      // §7.5 region 级：整块用 `EmptyState variant="error"`，并且必须带重试。
      return (
        <div role="alert" className="flex h-full items-center justify-center px-6">
          <EmptyState
            variant="error"
            title="文件内容读取失败"
            description={tab.fileName}
            error={tab.loadError}
            action={
              <Button variant="primary" icon={RefreshCw} onClick={() => void handleReload()}>
                重新读取
              </Button>
            }
          />
        </div>
      )
    }

    return (
      <div className="flex h-full items-center justify-center text-sm text-fg-muted">
        无法加载文件内容
      </div>
    )
  }

  const { leftLines, rightLines } = tab.diffResult

  return (
    <div className="flex h-full flex-col">
      {/* §4.4 的行序：工具栏在上，两条路径头是两栏各自的栏首（跟着分隔条走）。 */}
      <div className="flex h-toolbar shrink-0 items-center gap-1.5 border-b border-border bg-surface px-2 text-xs text-fg-muted">
        {/* 键盘提示行删掉了（§4.4）：同一个信息现在挂在这两个按钮的 tooltip 上。 */}
        <Button
          size="sm"
          icon={ChevronUp}
          disabled={diffSummary.hunks === 0}
          title="上一个差异 (Mod ⌥ ↑)"
          onClick={() => scrollToDiff('prev')}
        >
          上一个差异
        </Button>
        <Button
          size="sm"
          icon={ChevronDown}
          disabled={diffSummary.hunks === 0}
          title="下一个差异 (Mod ⌥ ↓)"
          onClick={() => scrollToDiff('next')}
        >
          下一个差异
        </Button>
        {diffSummary.hunks > 0 ? (
          // §0 规则 2：颜色不能单独承载含义，所以 `+` / `−` 字形和数字一起出现。
          <span className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-0.5">
            <span className="inline-flex items-center gap-1 font-mono text-diff-add tabular-nums">
              +{diffSummary.added}
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-diff-del tabular-nums">
              −{diffSummary.removed}
            </span>
            <span className="text-fg-subtle">·</span>
            <span className="tabular-nums text-fg-muted">{diffSummary.hunks} 个差异块</span>
          </span>
        ) : (
          <Badge tone="success" icon={CircleCheck}>两侧内容一致</Badge>
        )}
        {/*
          §4.4 / F6：保存动作原来住在一条「只在脏的时候才存在」的横幅里，于是每次
          第一次编辑都会把整个 diff 往下顶一行。现在它和差异导航同处这一条工具栏，
          干净时按钮 disabled 而不是消失——面板永远不跳。
        */}
        <div className="ml-auto flex items-center gap-1.5">
          {isModified ? <StatusDot status="warning" label="已修改" /> : null}
          {tab.leftSource ? (
            <Button
              variant={leftDirty ? 'primary' : 'secondary'}
              size="sm"
              icon={Save}
              disabled={!leftDirty}
              title={`保存左侧 (${SHORTCUT.saveLeft})`}
              onClick={() => handleSave('left')}
            >
              保存左侧
            </Button>
          ) : null}
          {tab.rightSource ? (
            <Button
              variant={rightDirty ? 'primary' : 'secondary'}
              size="sm"
              icon={Save}
              disabled={!rightDirty}
              title={`保存右侧 (${SHORTCUT.saveRight})`}
              onClick={() => handleSave('right')}
            >
              保存右侧
            </Button>
          ) : null}
        </div>
      </div>

      {/*
        Diff content — two panels with synchronized scroll.
        §4.3/§4.4：容器换成 `SplitPane`（分隔条 `role="separator"`、方向键调宽、
        双击回到 50/50、比例按 `storageKey` 持久化）。滚动同步、行虚拟化和
        `ScrollGutter` 一律不动：装订线仍旧只覆盖内容区，标记的百分比坐标
        算的还是同一段高度。
      */}
      <SplitPane
        className="min-h-0 flex-1"
        storageKey="file-diff-split"
        min={240}
        label="调整左右差异栏宽度"
      >
        {/* Left panel */}
        <div className="flex min-w-0 flex-1 flex-col">
          <PathHeaderCell side="left" path={tab.leftFullPath} />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div ref={leftRef} className="min-w-0 flex-1 overflow-auto font-mono text-xs" onScroll={() => handleScroll('left')}>
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
                  segmentMap={inlineSegments?.left}
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
          </div>
        </div>

        {/* Right panel */}
        <div className="flex min-w-0 flex-1 flex-col">
          <PathHeaderCell side="right" path={tab.rightFullPath} />
          <div ref={rightRef} className="min-h-0 flex-1 overflow-auto font-mono text-xs" onScroll={() => handleScroll('right')}>
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
                segmentMap={inlineSegments?.right}
                onApplyHunk={() => handleApplyRange(metric.hunk, 'right-to-left')}
                onApplyLine={(lineIndex) => handleApplyRange({ startIndex: lineIndex, endIndex: lineIndex + 1 }, 'right-to-left')}
              />
            ))}
            {visibleHunkWindow.bottomSpacerHeight > 0 && (
              <div aria-hidden="true" style={{ height: `${visibleHunkWindow.bottomSpacerHeight}px` }} />
            )}
          </div>
        </div>
      </SplitPane>
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
    ? 'bg-chart-3/15 text-chart-3'
    : 'bg-chart-2/15 text-chart-2'

  return (
    <div
      className="group flex shrink-0 items-center gap-1.5 truncate border-b border-border bg-surface px-3 py-1.5 text-xs text-fg-muted"
      title={display}
    >
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold uppercase ${badgeClass}`}>
        {side === 'left' ? 'L' : 'R'}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono">{truncatePath(display)}</span>
      {path && (
        // §5：悬停不得是唯一入口。键盘聚焦时同样显形（这个按钮一直在 Tab 序里，
        // 以前只是聚焦了也看不见）。
        <IconButton
          icon={Copy}
          label="复制完整路径"
          size="xs"
          variant="ghost"
          onClick={() => void copyPathToClipboard(path)}
          className="shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
        />
      )}
    </div>
  )
}

/** 装订线符号。`equal` 用 `same`（空白位），行与行之间列宽不变。 */
const DIFF_LINE_KIND: Record<DiffLine['type'], DiffKind> = {
  equal: 'same',
  add: 'add',
  remove: 'del',
}

const LINE_BG: Record<DiffLine['type'], string> = {
  equal: '',
  add: 'bg-diff-add-bg',
  remove: 'bg-diff-del-bg',
}

const LINE_EDGE: Record<DiffLine['type'], string> = {
  equal: 'border-l-2 border-l-transparent',
  add: 'border-l-2 border-l-diff-add',
  remove: 'border-l-2 border-l-diff-del',
}

const EMPHASIS_BG: Record<'add' | 'remove', string> = {
  add: 'bg-diff-add-bg-strong',
  remove: 'bg-diff-del-bg-strong',
}

interface HunkBlockProps {
  readonly hunk: Hunk
  readonly lines: readonly DiffLine[]
  readonly otherLines: readonly DiffLine[]
  readonly side: 'left' | 'right'
  readonly segmentMap?: ReadonlyMap<number, readonly InlineSegment[]>
  readonly onApplyHunk: () => void
  readonly onApplyLine: (lineIndex: number) => void
}

function HunkBlock({ hunk, lines, otherLines, side, segmentMap, onApplyHunk, onApplyLine }: HunkBlockProps) {
  const hunkLines = lines.slice(hunk.startIndex, hunk.endIndex)
  const isMultiLineDiff = hunk.endIndex - hunk.startIndex > 1

  return (
    <div className="group relative">
      {hunk.type === 'diff' && (
        <button
          onClick={onApplyHunk}
          className="absolute z-20 inline-flex items-center gap-0.5 rounded-md bg-accent px-1.5 py-0.5 text-2xs font-medium text-accent-fg opacity-0 transition-opacity hover:bg-accent-hover group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
          style={side === 'left' ? { right: 4, top: 2 } : { left: 4, top: 2 }}
          aria-label={side === 'left' ? '整块应用到右侧' : '整块应用到左侧'}
          title={side === 'left' ? '整块应用到右侧' : '整块应用到左侧'}
        >
          {isMultiLineDiff && side === 'right' ? <ArrowLeft aria-hidden size={12} strokeWidth={1.75} /> : null}
          {isMultiLineDiff ? '整块' : null}
          {isMultiLineDiff && side === 'left' ? <ArrowRight aria-hidden size={12} strokeWidth={1.75} /> : null}
          {!isMultiLineDiff
            ? (side === 'left'
                ? <ArrowRight aria-hidden size={12} strokeWidth={1.75} />
                : <ArrowLeft aria-hidden size={12} strokeWidth={1.75} />)
            : null}
        </button>
      )}
      {hunkLines.map((line, i) => {
        const lineIndex = hunk.startIndex + i
        const segments = segmentMap?.get(lineIndex)
        const emphasisClass =
          line.type === 'add' || line.type === 'remove' ? EMPHASIS_BG[line.type] : ''

        return (
          <div
            key={lineIndex}
            className={`group/line flex w-max min-w-full border-b border-border ${LINE_BG[line.type]} ${LINE_EDGE[line.type]}`}
            style={{ height: `${DIFF_ROW_HEIGHT}px` }}
          >
            {/*
              DESIGN-SYSTEM §1.5 第 1 条：每一条增删行都必须有 `+` / `−` 字形。
              绿/红在深色主题下的色盲分离度实测 ΔE 5.6，低于 ΔE 6 的下限——底色不是信号，
              符号才是。行号列保留在符号左边，两者一起构成这条 diff 的装订线。
            */}
            <span className="inline-flex w-16 shrink-0 items-center gap-1 border-r border-border py-0.5 pr-1.5 pl-2 select-none">
              <span className="min-w-0 flex-1 text-right tabular-nums text-fg-subtle">
                {line.lineNumber >= 0 ? line.lineNumber : ''}
              </span>
              <DiffGutter kind={DIFF_LINE_KIND[line.type]} />
            </span>
            {canApplyLine({
              hunkType: hunk.type,
              currentLine: line,
              otherLine: otherLines[lineIndex],
            }) && (
              <button
                onClick={() => onApplyLine(lineIndex)}
                className="mx-1 my-0.5 inline-flex shrink-0 items-center justify-center rounded bg-accent px-1 text-2xs font-medium text-accent-fg opacity-0 transition-opacity hover:bg-accent-hover group-focus-within/line:opacity-100 group-hover/line:opacity-100 focus-visible:opacity-100"
                aria-label={side === 'left' ? '仅应用当前行到右侧' : '仅应用当前行到左侧'}
                title={side === 'left' ? '仅应用当前行到右侧' : '仅应用当前行到左侧'}
              >
                {side === 'left'
                  ? <ArrowRight aria-hidden size={12} strokeWidth={1.75} />
                  : <ArrowLeft aria-hidden size={12} strokeWidth={1.75} />}
              </button>
            )}
            <pre className="min-w-0 whitespace-pre px-2 py-0.5">
              {segments
                ? segments.map((seg, segIndex) =>
                    seg.emphasis ? (
                      <span key={segIndex} className={emphasisClass}>
                        {seg.text}
                      </span>
                    ) : (
                      <span key={segIndex}>{seg.text}</span>
                    ),
                  )
                : line.content}
            </pre>
          </div>
        )
      })}
    </div>
  )
}
