import { useEffect, useMemo, useRef, useState } from 'react'
import { useTextDiffStore } from '../stores/text-diff-store'
import TextInputPanel from '../components/TextInputPanel'
import { buildInlineSegments } from '../utils/inline-diff'
import {
  addManualAlignment,
  computeAlignedTextDiff,
  type ManualAlignmentPair,
  type ManualAlignRequest,
} from '../utils/manual-align'

export default function TextComparePage() {
  const {
    leftText,
    rightText,
    leftLabel,
    rightLabel,
    result,
    error,
    charLevel,
    setLeftText,
    setRightText,
    swap,
    clear,
    setResult,
    setComputing,
    setError,
    toggleCharLevel,
  } = useTextDiffStore()

  const compareRequestIdRef = useRef(0)
  const leftTextAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const rightTextAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const syncingScrollRef = useRef(false)
  const [manualAlignments, setManualAlignments] = useState<readonly ManualAlignmentPair[]>([])
  const [manualAlignRequest, setManualAlignRequest] = useState<ManualAlignRequest | null>(null)
  const [manualAlignError, setManualAlignError] = useState<string | null>(null)

  useEffect(() => {
    const compareRequestId = compareRequestIdRef.current + 1
    compareRequestIdRef.current = compareRequestId

    if (leftText.length === 0 && rightText.length === 0) {
      setResult(null)
      setError(null)
      setComputing(false)
      return
    }

    setComputing(true)
    setError(null)

    const timer = window.setTimeout(async () => {
      try {
        const res = await window.api.textDiff(leftText, rightText)
        if (compareRequestId !== compareRequestIdRef.current) return

        if (res.success && res.data) {
          setResult(res.data)
        } else {
          setResult(null)
          setError(res.error ?? '对比失败')
        }
      } finally {
        if (compareRequestId === compareRequestIdRef.current) {
          setComputing(false)
        }
      }
    }, 120)

    return () => {
      window.clearTimeout(timer)
    }
  }, [leftText, rightText, setComputing, setError, setResult])

  useEffect(() => {
    setManualAlignments([])
    setManualAlignRequest(null)
    setManualAlignError(null)
  }, [leftText, rightText])

  useEffect(() => {
    if (!manualAlignRequest) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setManualAlignRequest(null)
        setManualAlignError(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [manualAlignRequest])

  const displayResult = useMemo(
    () => {
      if (!result) return null
      if (manualAlignments.length === 0) return result
      return computeAlignedTextDiff(leftText, rightText, manualAlignments)
    },
    [manualAlignments, result, leftText, rightText],
  )

  const leftChangedLines = useMemo(() => {
    const lines = new Set<number>()
    for (const line of displayResult?.leftLines ?? []) {
      if (line.type === 'remove' && line.lineNumber > 0) {
        lines.add(line.lineNumber)
      }
    }
    return lines
  }, [displayResult])

  const rightChangedLines = useMemo(() => {
    const lines = new Set<number>()
    for (const line of displayResult?.rightLines ?? []) {
      if (line.type === 'add' && line.lineNumber > 0) {
        lines.add(line.lineNumber)
      }
    }
    return lines
  }, [displayResult])

  const diffSummary = useMemo(() => {
    if (!result) return null

    let leftChanges = 0
    let rightChanges = 0
    for (const line of result.leftLines) {
      if (line.type === 'remove') leftChanges += 1
    }
    for (const line of result.rightLines) {
      if (line.type === 'add') rightChanges += 1
    }

    return {
      leftChanges,
      rightChanges,
      hasDiff: leftChanges > 0 || rightChanges > 0,
    }
  }, [result])

  const inlineSegments = useMemo(
    () => (displayResult && charLevel ? buildInlineSegments(displayResult.leftLines, displayResult.rightLines) : null),
    [charLevel, displayResult],
  )

  const leftAlignedLines = useMemo(
    () => new Set(manualAlignments.map((alignment) => alignment.leftLineNumber)),
    [manualAlignments],
  )

  const rightAlignedLines = useMemo(
    () => new Set(manualAlignments.map((alignment) => alignment.rightLineNumber)),
    [manualAlignments],
  )

  const manualAlignHint = useMemo(() => {
    if (manualAlignRequest) {
      if (manualAlignRequest.lineNumber == null) {
        return `已进入手动对齐：先点${manualAlignRequest.side === 'left' ? '左' : '右'}侧锚点行，再点另一侧目标行，Esc 取消`
      }
      return `已选${manualAlignRequest.side === 'left' ? '左' : '右'}侧第 ${manualAlignRequest.lineNumber} 行；可先点本侧修正锚点，再点另一侧完成，Esc 取消`
    }
    if (manualAlignments.length > 0) {
      return `已启用 ${manualAlignments.length} 组手动对齐，按 Cmd/Ctrl+Shift+L 可继续添加`
    }
    return '手动对齐：将光标放到某行后按 Cmd/Ctrl+Shift+L，再点击另一侧行'
  }, [manualAlignRequest, manualAlignments.length])

  const startManualAlign = (side: ManualAlignRequest['side'], lineNumber: number | null) => {
    if (!result) {
      return
    }

    setManualAlignError(null)
    setManualAlignRequest({ side, lineNumber })
  }

  const finishManualAlign = (side: ManualAlignRequest['side'], lineNumber: number | null) => {
    if (!manualAlignRequest) {
      return
    }

    if (lineNumber == null) {
      setManualAlignError('请选择有实际内容的行')
      return
    }

    if (side === manualAlignRequest.side || manualAlignRequest.lineNumber == null) {
      setManualAlignRequest({ side: manualAlignRequest.side, lineNumber })
      setManualAlignError(null)
      return
    }

    const nextAlignment = manualAlignRequest.side === 'left'
      ? { leftLineNumber: manualAlignRequest.lineNumber, rightLineNumber: lineNumber }
      : { leftLineNumber: lineNumber, rightLineNumber: manualAlignRequest.lineNumber }

    const next = addManualAlignment(manualAlignments, nextAlignment)
    if (next.error) {
      setManualAlignError(next.error)
      return
    }

    setManualAlignments(next.alignments)
    setManualAlignRequest(null)
    setManualAlignError(null)
  }

  const clearManualAlignments = () => {
    setManualAlignments([])
    setManualAlignRequest(null)
    setManualAlignError(null)
  }

  const syncPanelScroll = (source: 'left' | 'right', scrollTop: number, scrollLeft: number) => {
    if (syncingScrollRef.current) return

    syncingScrollRef.current = true
    const target = source === 'left' ? rightTextAreaRef.current : leftTextAreaRef.current
    if (target) {
      target.scrollTop = scrollTop
      target.scrollLeft = scrollLeft
    }

    requestAnimationFrame(() => {
      syncingScrollRef.current = false
    })
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="text-sm text-neutral-400">粘贴或拖入文本后自动对比</span>
        <button
          onClick={swap}
          className="rounded bg-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-600"
        >
          交换 ⇄
        </button>
        <button
          onClick={clear}
          className="rounded bg-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-600"
        >
          清空
        </button>
        <button
          onClick={toggleCharLevel}
          disabled={!result}
          className={`rounded px-3 py-1.5 text-sm transition-colors ${
            charLevel
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'bg-neutral-700 text-neutral-200 hover:bg-neutral-600'
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          字符对比{charLevel ? '：开' : '：关'}
        </button>
        {(manualAlignRequest || manualAlignments.length > 0) && (
          <button
            onClick={clearManualAlignments}
            className="rounded bg-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-600"
          >
            清除手动对齐
          </button>
        )}
        {error && <span className="text-sm text-red-400">{error}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
          <span className={manualAlignError ? 'text-amber-300' : 'text-neutral-500'}>
            {manualAlignError ?? manualAlignHint}
          </span>
          <span className="text-neutral-500">
            {diffSummary
              ? diffSummary.hasDiff
                ? `左侧 ${diffSummary.leftChanges} 行变化，右侧 ${diffSummary.rightChanges} 行变化`
                : '两侧内容一致'
              : '等待输入文本'}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        <TextInputPanel
          side="left"
          label="左侧"
          value={leftText}
          fileLabel={leftLabel}
          diffLines={displayResult?.leftLines}
          highlightedLines={leftChangedLines}
          highlightType="remove"
          charLevel={charLevel}
          inlineSegments={inlineSegments?.left}
          textAreaRef={leftTextAreaRef}
          onScrollPositionChange={(top, left) => syncPanelScroll('left', top, left)}
          manualAlignRequest={manualAlignRequest}
          alignedLineNumbers={leftAlignedLines}
          onManualAlignShortcut={(lineNumber) => startManualAlign('left', lineNumber)}
          onManualAlignLineClick={finishManualAlign}
          onChange={(text, file) => setLeftText(text, file ?? '')}
          onClear={() => setLeftText('', '')}
        />
        <TextInputPanel
          side="right"
          label="右侧"
          value={rightText}
          fileLabel={rightLabel}
          diffLines={displayResult?.rightLines}
          highlightedLines={rightChangedLines}
          highlightType="add"
          charLevel={charLevel}
          inlineSegments={inlineSegments?.right}
          textAreaRef={rightTextAreaRef}
          onScrollPositionChange={(top, left) => syncPanelScroll('right', top, left)}
          manualAlignRequest={manualAlignRequest}
          alignedLineNumbers={rightAlignedLines}
          onManualAlignShortcut={(lineNumber) => startManualAlign('right', lineNumber)}
          onManualAlignLineClick={finishManualAlign}
          onChange={(text, file) => setRightText(text, file ?? '')}
          onClear={() => setRightText('', '')}
        />
      </div>
    </div>
  )
}
