import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { DiffLine } from '../../../shared/types'
import type { InlineSegment } from '../utils/inline-diff'
import { matchesShortcut, SHORTCUT_SPECS } from '../hooks/shortcuts'
import { readFileAsText } from '../utils/read-text-file'
import { getVisibleRowWindow } from './text-panel-window'
import {
  getDisplayRowIndexFromTextOffset,
  type ManualAlignRequest,
  type TextDiffSide,
} from '../utils/manual-align'

const DISPLAY_ROW_HEIGHT = 20
const DISPLAY_ROW_OVERSCAN = 12

interface TextInputPanelProps {
  readonly side: TextDiffSide
  readonly label: string
  readonly value: string
  readonly fileLabel: string
  readonly diffLines?: readonly DiffLine[]
  readonly inlineSegments?: ReadonlyMap<number, readonly InlineSegment[]>
  readonly highlightedLines?: ReadonlySet<number>
  readonly highlightType?: 'add' | 'remove'
  readonly charLevel?: boolean
  readonly textAreaRef?: React.RefObject<HTMLTextAreaElement | null>
  readonly onScrollPositionChange?: (scrollTop: number, scrollLeft: number) => void
  readonly manualAlignRequest?: ManualAlignRequest | null
  readonly alignedLineNumbers?: ReadonlySet<number>
  readonly onManualAlignShortcut?: (lineNumber: number | null) => void
  readonly onManualAlignLineClick?: (side: TextDiffSide, lineNumber: number | null) => void
  readonly onChange: (text: string, fileLabel?: string) => void
  readonly onClear: () => void
}

interface DisplayRow {
  readonly key: string
  readonly number: string
  readonly lineNumber: number | null
  readonly content: string
  readonly highlighted: boolean
  readonly type: DiffLine['type']
  readonly segments: readonly InlineSegment[] | undefined
}

export default function TextInputPanel({
  side,
  label,
  value,
  fileLabel,
  diffLines,
  inlineSegments,
  highlightedLines,
  highlightType = 'remove',
  charLevel = false,
  textAreaRef,
  onScrollPositionChange,
  manualAlignRequest,
  alignedLineNumbers,
  onManualAlignShortcut,
  onManualAlignLineClick,
  onChange,
  onClear,
}: TextInputPanelProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const dragDepthRef = useRef(0)
  const highlightRef = useRef<HTMLDivElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const manualAlignOverlayRef = useRef<HTMLDivElement>(null)
  const internalTextAreaRef = useRef<HTMLTextAreaElement>(null)
  const [overlayScrollTop, setOverlayScrollTop] = useState(0)
  const [overlayViewportHeight, setOverlayViewportHeight] = useState(0)

  const resolvedTextAreaRef = textAreaRef ?? internalTextAreaRef
  const { displayRows, displayValue } = useMemo((): {
    readonly displayRows: readonly DisplayRow[]
    readonly displayValue: string
  } => {
    if (diffLines && diffLines.length > 0) {
      const rows: DisplayRow[] = []
      const lineContents = new Array<string>(diffLines.length)

      for (let index = 0; index < diffLines.length; index += 1) {
        const line = diffLines[index]
        const lineNumber = line.lineNumber > 0 ? line.lineNumber : null

        lineContents[index] = line.content
        rows.push({
          key: `${line.lineNumber}-${index}`,
          number: lineNumber === null ? '' : String(lineNumber),
          lineNumber,
          content: line.content,
          highlighted: line.type === highlightType,
          type: line.type,
          segments: inlineSegments?.get(index),
        })
      }

      return {
        displayRows: rows,
        displayValue: lineContents.join('\n'),
      }
    }

    const rawLines = value.length > 0 ? value.split('\n') : ['']
    return {
      displayRows: rawLines.map((content, index) => {
        const lineNumber = index + 1
        const highlighted = highlightedLines?.has(lineNumber) ?? false

        return {
          key: String(index),
          number: String(lineNumber),
          lineNumber,
          content,
          highlighted,
          type: highlighted ? highlightType : 'equal',
          segments: undefined,
        }
      }),
      displayValue: value,
    }
  }, [diffLines, highlightType, highlightedLines, inlineSegments, value])
  const visibleRowWindow = useMemo(() => getVisibleRowWindow({
    totalRows: displayRows.length,
    scrollTop: overlayScrollTop,
    viewportHeight: overlayViewportHeight,
    rowHeight: DISPLAY_ROW_HEIGHT,
    overscanRows: DISPLAY_ROW_OVERSCAN,
  }), [displayRows.length, overlayScrollTop, overlayViewportHeight])
  const visibleRows = useMemo(
    () => displayRows.slice(visibleRowWindow.startIndex, visibleRowWindow.endIndex),
    [displayRows, visibleRowWindow.endIndex, visibleRowWindow.startIndex],
  )
  const lineHighlightClass = highlightType === 'add' ? 'bg-diff-add-bg' : 'bg-diff-del-bg'
  const emphasisClass = highlightType === 'add' ? 'bg-diff-add-bg-strong' : 'bg-diff-del-bg-strong'
  const manualAlignActive = manualAlignRequest != null
  const awaitingManualAlignTarget = manualAlignRequest != null && manualAlignRequest.side !== side

  useEffect(() => {
    const element = resolvedTextAreaRef.current
    if (!element) {
      return
    }

    const updateViewport = () => {
      setOverlayViewportHeight(element.clientHeight)
      setOverlayScrollTop(element.scrollTop)
    }

    updateViewport()
    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(updateViewport)
    observer.observe(element)

    return () => observer.disconnect()
  }, [resolvedTextAreaRef])

  useEffect(() => {
    if (!manualAlignActive || !manualAlignOverlayRef.current) {
      return
    }

    manualAlignOverlayRef.current.scrollTop = resolvedTextAreaRef.current?.scrollTop ?? 0
  }, [manualAlignActive, resolvedTextAreaRef])

  const resolveLineNumberFromSelection = (element: HTMLTextAreaElement): number | null => {
    const rowIndex = getDisplayRowIndexFromTextOffset(element.value, element.selectionStart)
    return displayRows[rowIndex]?.lineNumber ?? null
  }

  const syncHighlightScroll = (element: HTMLTextAreaElement) => {
    setOverlayScrollTop(element.scrollTop)
    if (highlightRef.current) {
      highlightRef.current.scrollTop = element.scrollTop
      highlightRef.current.scrollLeft = element.scrollLeft
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = element.scrollTop
    }
    if (manualAlignOverlayRef.current) {
      manualAlignOverlayRef.current.scrollTop = element.scrollTop
    }
    onScrollPositionChange?.(element.scrollTop, element.scrollLeft)
  }

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes('Files')) {
      event.preventDefault()
      dragDepthRef.current += 1
      setIsDragOver(true)
    }
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes('Files')) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setIsDragOver(false)
    }
  }

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDragOver(false)

    const file = event.dataTransfer.files[0]
    if (!file) return

    try {
      const text = await readFileAsText(file)
      onChange(text, file.name)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '读取文件失败'
      onChange(`[读取失败: ${msg}]`, file.name)
    }
  }

  const handleTextChange = (text: string) => {
    if (!diffLines || diffLines.length === 0) {
      onChange(text)
      return
    }

    const editedRows = text.split('\n')
    const actualLines: string[] = []

    for (let index = 0; index < editedRows.length; index++) {
      const editedContent = editedRows[index] ?? ''
      const originalRow = diffLines[index]

      if (!originalRow || originalRow.lineNumber > 0 || editedContent.length > 0) {
        actualLines.push(editedContent)
      }
    }

    onChange(actualLines.join('\n'))
  }

  const renderOverlayLine = (
    segments: readonly InlineSegment[] | undefined,
    content: string,
    highlighted: boolean,
  ) => {
    if (!highlighted || !charLevel || !segments || segments.length === 0) {
      return content.length > 0 ? content : ' '
    }

    return segments.map((segment, index) => (
      <span key={index} className={segment.emphasis ? emphasisClass : ''}>
        {segment.text}
      </span>
    ))
  }

  const handleTextAreaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 和弦本身来自 `hooks/shortcuts.ts` 那张唯一的表，工具栏 `⋯` 里显示的
    // `⇧ Mod L` 和这里真正匹配的键因此不可能分叉。
    if (onManualAlignShortcut && matchesShortcut(event, SHORTCUT_SPECS.manualAlign)) {
      event.preventDefault()
      onManualAlignShortcut(resolveLineNumberFromSelection(event.currentTarget))
    }
  }

  const sideBadgeClass = side === 'left'
    ? 'bg-chart-3/15 text-chart-3'
    : 'bg-chart-2/15 text-chart-2'

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border transition-colors ${
        isDragOver ? 'border-accent bg-accent-quiet ring-2 ring-dashed ring-accent/40' : 'border-border'
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-2 py-1.5 text-xs">
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold uppercase ${sideBadgeClass}`}>
          {side === 'left' ? 'L' : 'R'}
        </span>
        <span className="font-medium text-fg">{label}</span>
        {fileLabel && (
          <span className="truncate font-mono text-fg-muted" title={fileLabel}>
            {fileLabel}
          </span>
        )}
        {manualAlignRequest?.side === side && (
          <span className="inline-flex items-center gap-1 rounded bg-warning-quiet px-1.5 py-0.5 text-xs text-warning-text">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" />
            {manualAlignRequest.lineNumber == null
              ? '点击当前侧锚点行'
              : `锚点行 ${manualAlignRequest.lineNumber} · 可点击改锚点`}
          </span>
        )}
        {awaitingManualAlignTarget && (
          <span className="inline-flex items-center gap-1 rounded bg-warning-quiet px-1.5 py-0.5 text-xs text-warning-text">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" />
            点击此侧目标行
          </span>
        )}
        <span className="ml-auto rounded bg-surface-2 px-1.5 py-0.5 tabular-nums text-fg-muted">{value.length} 字符</span>
        {value && (
          <button
            onClick={onClear}
            aria-label="清空"
            className="inline-flex h-5 w-5 items-center justify-center rounded text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            title="清空"
          >
            <X aria-hidden size={12} strokeWidth={1.75} />
          </button>
        )}
      </div>
      <div className="relative flex-1 overflow-hidden bg-canvas">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 overflow-hidden border-r border-border bg-inset font-mono text-xs leading-5 text-fg-muted"
        >
          <div className="py-2">
            {visibleRowWindow.topSpacerHeight > 0 && <div style={{ height: `${visibleRowWindow.topSpacerHeight}px` }} />}
            {visibleRows.map((row) => (
              <div
                key={row.key}
                className={`h-5 px-2 text-right ${
                  row.lineNumber != null && manualAlignRequest?.side === side && manualAlignRequest.lineNumber === row.lineNumber
                    ? 'bg-warning-quiet text-warning-text'
                    : row.lineNumber != null && alignedLineNumbers?.has(row.lineNumber)
                      ? 'text-warning-text'
                      : ''
                }`}
              >
                {row.number}
              </div>
            ))}
            {visibleRowWindow.bottomSpacerHeight > 0 && <div style={{ height: `${visibleRowWindow.bottomSpacerHeight}px` }} />}
          </div>
        </div>

        <div
          ref={highlightRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden py-2 pl-14 pr-2 font-mono text-xs leading-5 text-fg"
        >
          <div className="min-w-full w-max">
            {visibleRowWindow.topSpacerHeight > 0 && <div style={{ height: `${visibleRowWindow.topSpacerHeight}px` }} />}
            {visibleRows.map((row) => (
              <div
                key={row.key}
                className={`h-5 min-w-full whitespace-pre rounded-sm pr-2 ${
                  row.highlighted ? lineHighlightClass : ''
                } ${
                  row.lineNumber != null && manualAlignRequest?.side === side && manualAlignRequest.lineNumber === row.lineNumber
                    ? 'ring-1 ring-inset ring-warning/30 bg-warning-quiet'
                    : row.lineNumber != null && alignedLineNumbers?.has(row.lineNumber)
                      ? 'ring-1 ring-inset ring-warning/30'
                      : ''
                }`}
              >
                {renderOverlayLine(row.segments, row.content, row.highlighted)}
              </div>
            ))}
            {visibleRowWindow.bottomSpacerHeight > 0 && <div style={{ height: `${visibleRowWindow.bottomSpacerHeight}px` }} />}
          </div>
        </div>

        {manualAlignActive && onManualAlignLineClick && (
          <div
            ref={manualAlignOverlayRef}
            className="absolute inset-0 z-30 overflow-hidden py-2 font-mono text-xs leading-5"
          >
            {visibleRowWindow.topSpacerHeight > 0 && <div style={{ height: `${visibleRowWindow.topSpacerHeight}px` }} />}
            {visibleRows.map((row) => (
              <div
                key={row.key}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onManualAlignLineClick(side, row.lineNumber)}
                className={`flex h-5 ${
                  row.lineNumber != null
                    ? 'cursor-crosshair hover:bg-warning-quiet'
                    : 'cursor-not-allowed'
                }`}
              >
                <div className="w-12 shrink-0" />
                <div className="flex-1" />
              </div>
            ))}
            {visibleRowWindow.bottomSpacerHeight > 0 && <div style={{ height: `${visibleRowWindow.bottomSpacerHeight}px` }} />}
          </div>
        )}

        <textarea
          ref={resolvedTextAreaRef}
          value={displayValue}
          onChange={(e) => handleTextChange(e.target.value)}
          onScroll={(e) => syncHighlightScroll(e.currentTarget)}
          onKeyDown={handleTextAreaKeyDown}
          placeholder="拖入文件，或粘贴/输入文本..."
          spellCheck={false}
          wrap="off"
          data-focus-inset
          className={`relative z-20 h-full w-full resize-none bg-transparent py-2 pl-14 pr-2 font-mono text-xs leading-5 text-transparent caret-fg placeholder:text-fg-subtle ${
            awaitingManualAlignTarget ? 'cursor-crosshair' : ''
          }`}
        />
      </div>
    </div>
  )
}
