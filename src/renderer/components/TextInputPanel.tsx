import { useEffect, useMemo, useRef, useState } from 'react'
import type { DiffLine } from '../../../shared/types'
import type { InlineSegment } from '../utils/inline-diff'
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

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsText(file)
  })
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
  const lineHighlightClass = highlightType === 'add' ? 'bg-green-900/30' : 'bg-red-900/30'
  const emphasisClass = highlightType === 'add' ? 'bg-green-600/50' : 'bg-red-600/50'
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
    if (
      onManualAlignShortcut
      && (event.metaKey || event.ctrlKey)
      && event.shiftKey
      && !event.altKey
      && event.key.toLowerCase() === 'l'
    ) {
      event.preventDefault()
      onManualAlignShortcut(resolveLineNumberFromSelection(event.currentTarget))
    }
  }

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded border transition-colors ${
        isDragOver ? 'border-blue-500 bg-blue-500/5' : 'border-neutral-700'
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-2 py-1 text-xs">
        <span className="font-medium text-neutral-300">{label}</span>
        {fileLabel && (
          <span className="truncate text-neutral-500" title={fileLabel}>
            {fileLabel}
          </span>
        )}
        {manualAlignRequest?.side === side && manualAlignRequest.lineNumber != null && (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300">
            锚点行 {manualAlignRequest.lineNumber}
          </span>
        )}
        {manualAlignRequest?.side === side && manualAlignRequest.lineNumber == null && (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300">
            点击当前侧锚点行
          </span>
        )}
        {awaitingManualAlignTarget && (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300">
            点击此侧目标行
          </span>
        )}
        {manualAlignRequest?.side === side && (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300">
            {manualAlignRequest.lineNumber == null ? '先选锚点' : '可点击改锚点'}
          </span>
        )}
        <span className="ml-auto text-neutral-600">{value.length} 字符</span>
        {value && (
          <button
            onClick={onClear}
            className="rounded px-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
            title="清空"
          >
            ×
          </button>
        )}
      </div>
      <div className="relative flex-1 overflow-hidden bg-neutral-900">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 overflow-hidden border-r border-neutral-800 bg-neutral-950/95 font-mono text-xs leading-5 text-neutral-500"
        >
          <div className="py-2">
            {visibleRowWindow.topSpacerHeight > 0 && <div style={{ height: `${visibleRowWindow.topSpacerHeight}px` }} />}
            {visibleRows.map((row) => (
              <div
                key={row.key}
                className={`h-5 px-2 text-right ${
                  row.lineNumber != null && manualAlignRequest?.side === side && manualAlignRequest.lineNumber === row.lineNumber
                    ? 'bg-amber-500/15 text-amber-300'
                    : row.lineNumber != null && alignedLineNumbers?.has(row.lineNumber)
                      ? 'text-amber-200'
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
          className="pointer-events-none absolute inset-0 overflow-hidden py-2 pl-14 pr-2 font-mono text-xs leading-5 text-neutral-100"
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
                    ? 'ring-1 ring-inset ring-amber-300/80 bg-amber-500/20'
                    : row.lineNumber != null && alignedLineNumbers?.has(row.lineNumber)
                      ? 'ring-1 ring-inset ring-amber-400/30'
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
                    ? 'cursor-crosshair hover:bg-amber-500/10'
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
          className={`relative z-20 h-full w-full resize-none bg-transparent py-2 pl-14 pr-2 font-mono text-xs leading-5 text-transparent caret-neutral-100 placeholder-neutral-600 outline-none ${
            awaitingManualAlignTarget ? 'cursor-crosshair' : ''
          }`}
        />
      </div>
    </div>
  )
}
