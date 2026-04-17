import { useMemo, useRef, useState } from 'react'
import type { DiffLine } from '../../../shared/types'
import type { InlineSegment } from '../utils/inline-diff'

interface TextInputPanelProps {
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
  readonly onChange: (text: string, fileLabel?: string) => void
  readonly onClear: () => void
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
  onChange,
  onClear,
}: TextInputPanelProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const dragDepthRef = useRef(0)
  const highlightRef = useRef<HTMLDivElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const internalTextAreaRef = useRef<HTMLTextAreaElement>(null)

  const resolvedTextAreaRef = textAreaRef ?? internalTextAreaRef
  const displayRows = useMemo(() => {
    if (diffLines && diffLines.length > 0) {
      return diffLines.map((line, index) => ({
        key: `${line.lineNumber}-${index}`,
        number: line.lineNumber > 0 ? String(line.lineNumber) : '',
        content: line.content,
        highlighted: line.type === highlightType,
        type: line.type,
        segments: inlineSegments?.get(index),
      }))
    }

    const rawLines = value.length > 0 ? value.split('\n') : ['']
    return rawLines.map((content, index) => ({
      key: String(index),
      number: String(index + 1),
      content,
      highlighted: highlightedLines?.has(index + 1) ?? false,
      type: highlightedLines?.has(index + 1) ? highlightType : 'equal',
      segments: undefined,
    }))
  }, [diffLines, highlightType, highlightedLines, inlineSegments, value])
  const displayValue = useMemo(
    () => displayRows.map((row) => row.content).join('\n'),
    [displayRows],
  )
  const lineHighlightClass = highlightType === 'add' ? 'bg-green-900/30' : 'bg-red-900/30'
  const emphasisClass = highlightType === 'add' ? 'bg-green-600/50' : 'bg-red-600/50'

  const syncHighlightScroll = (element: HTMLTextAreaElement) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = element.scrollTop
      highlightRef.current.scrollLeft = element.scrollLeft
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = element.scrollTop
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
            {displayRows.map((row) => (
              <div key={row.key} className="h-5 px-2 text-right">
                {row.number}
              </div>
            ))}
          </div>
        </div>

        <div
          ref={highlightRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden py-2 pl-14 pr-2 font-mono text-xs leading-5 text-neutral-100"
        >
          {displayRows.map((row) => (
            <div
              key={row.key}
              className={`h-5 overflow-hidden whitespace-pre rounded-sm ${row.highlighted ? lineHighlightClass : ''}`}
            >
              {renderOverlayLine(row.segments, row.content, row.highlighted)}
            </div>
          ))}
        </div>

        <textarea
          ref={resolvedTextAreaRef}
          value={displayValue}
          onChange={(e) => handleTextChange(e.target.value)}
          onScroll={(e) => syncHighlightScroll(e.currentTarget)}
          placeholder="拖入文件，或粘贴/输入文本..."
          spellCheck={false}
          wrap="off"
          className="relative z-20 h-full w-full resize-none bg-transparent py-2 pl-14 pr-2 font-mono text-xs leading-5 text-transparent caret-neutral-100 placeholder-neutral-600 outline-none"
        />
      </div>
    </div>
  )
}
