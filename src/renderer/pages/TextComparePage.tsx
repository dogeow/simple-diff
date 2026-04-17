import { useEffect, useMemo, useRef } from 'react'
import { useTextDiffStore } from '../stores/text-diff-store'
import TextInputPanel from '../components/TextInputPanel'

export default function TextComparePage() {
  const {
    leftText,
    rightText,
    leftLabel,
    rightLabel,
    result,
    error,
    setLeftText,
    setRightText,
    swap,
    clear,
    setResult,
    setComputing,
    setError,
  } = useTextDiffStore()

  const compareRequestIdRef = useRef(0)
  const leftTextAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const rightTextAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const syncingScrollRef = useRef(false)

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

  const leftChangedLines = useMemo(() => {
    const lines = new Set<number>()
    for (const line of result?.leftLines ?? []) {
      if (line.type === 'remove' && line.lineNumber > 0) {
        lines.add(line.lineNumber)
      }
    }
    return lines
  }, [result])

  const rightChangedLines = useMemo(() => {
    const lines = new Set<number>()
    for (const line of result?.rightLines ?? []) {
      if (line.type === 'add' && line.lineNumber > 0) {
        lines.add(line.lineNumber)
      }
    }
    return lines
  }, [result])

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
      <div className="flex shrink-0 items-center gap-2">
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
        {error ? (
          <span className="text-sm text-red-400">{error}</span>
        ) : (
          <span className="ml-auto text-xs text-neutral-500">
            {diffSummary
              ? diffSummary.hasDiff
                ? `左侧 ${diffSummary.leftChanges} 行变化，右侧 ${diffSummary.rightChanges} 行变化`
                : '两侧内容一致'
              : '等待输入文本'}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        <TextInputPanel
          label="左侧"
          value={leftText}
          fileLabel={leftLabel}
          highlightedLines={leftChangedLines}
          highlightType="remove"
          textAreaRef={leftTextAreaRef}
          onScrollPositionChange={(top, left) => syncPanelScroll('left', top, left)}
          onChange={(text, file) => setLeftText(text, file ?? '')}
          onClear={() => setLeftText('', '')}
        />
        <TextInputPanel
          label="右侧"
          value={rightText}
          fileLabel={rightLabel}
          highlightedLines={rightChangedLines}
          highlightType="add"
          textAreaRef={rightTextAreaRef}
          onScrollPositionChange={(top, left) => syncPanelScroll('right', top, left)}
          onChange={(text, file) => setRightText(text, file ?? '')}
          onClear={() => setRightText('', '')}
        />
      </div>
    </div>
  )
}
