import { computeTextDiffAsync } from '../runtime/text-diff-client'
import type { TextDiffResult } from '../../../shared/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, Eraser, FileInput, Rows3, X } from 'lucide-react'
import { Button, Panel, SplitPane, Switch, Toolbar, type MenuItem } from '../components/ui'
import { useShallow } from 'zustand/react/shallow'
import { useTextDiffStore } from '../stores/text-diff-store'
import { useUIStore, type StatusHint } from '../stores/ui-store'
import TextInputPanel from '../components/TextInputPanel'
import { SHORTCUT } from '../hooks/shortcuts'
import { buildInlineSegments } from '../utils/inline-diff'
import { readFileAsText } from '../utils/read-text-file'
import {
  addManualAlignment,
  type ManualAlignmentPair,
  type ManualAlignRequest,
  type TextDiffSide,
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
  } = useTextDiffStore(useShallow((state) => ({
    leftText: state.leftText,
    rightText: state.rightText,
    leftLabel: state.leftLabel,
    rightLabel: state.rightLabel,
    result: state.result,
    error: state.error,
    charLevel: state.charLevel,
    setLeftText: state.setLeftText,
    setRightText: state.setRightText,
    swap: state.swap,
    clear: state.clear,
    setResult: state.setResult,
    setComputing: state.setComputing,
    setError: state.setError,
    toggleCharLevel: state.toggleCharLevel,
  })))

  const setStatusHint = useUIStore((state) => state.setStatusHint)

  const compareRequestIdRef = useRef(0)
  const leftTextAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const rightTextAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const syncingScrollRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const loadTargetSideRef = useRef<TextDiffSide>('left')
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

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const res = await window.api.textDiff(leftText, rightText, controller.signal)
        if (compareRequestId !== compareRequestIdRef.current) return

        if (res.success && res.data) {
          setResult(res.data)
        } else {
          setResult(null)
          setError(res.error ?? '对比失败')
        }
      } catch (error) {
        if (compareRequestId === compareRequestIdRef.current && !controller.signal.aborted) {
          setError(error instanceof Error ? error.message : '对比失败')
        }
      } finally {
        if (compareRequestId === compareRequestIdRef.current) {
          setComputing(false)
        }
      }
    }, 120)

    return () => {
      compareRequestIdRef.current++
      controller.abort()
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

  const [alignedResult, setAlignedResult] = useState<TextDiffResult | null>(null)
  useEffect(() => {
    setAlignedResult(null)
    if (!result || manualAlignments.length === 0) return
    const controller = new AbortController()
    setComputing(true)
    void computeTextDiffAsync(leftText, rightText, controller.signal, manualAlignments).then((response) => {
      if (controller.signal.aborted) return
      if (response.success && response.data) setAlignedResult(response.data)
      else setManualAlignError(response.error ?? '手动对齐失败')
      setComputing(false)
    })
    return () => controller.abort()
  }, [result, leftText, rightText, manualAlignments, setComputing])
  const displayResult = manualAlignments.length ? alignedResult ?? result : result

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
  const hasText = leftText.length > 0 || rightText.length > 0

  const leftAlignedLines = useMemo(
    () => new Set(manualAlignments.map((alignment) => alignment.leftLineNumber)),
    [manualAlignments],
  )

  const rightAlignedLines = useMemo(
    () => new Set(manualAlignments.map((alignment) => alignment.rightLineNumber)),
    [manualAlignments],
  )

  /**
   * §4.5：手动对齐的提示是「转瞬即逝的引导，不是常驻装饰」，所以它只在真的有话说的
   * 时候才占状态栏——没进手动对齐、也没有已生效的对齐组时返回 `null`，任务槽让回给
   * 后台作业（或「就绪」）。出错时 `warning` 色，与旧的行内胶囊同调。
   */
  const statusHint = useMemo((): StatusHint | null => {
    if (manualAlignError) {
      return { tone: 'warning', label: manualAlignError }
    }
    if (manualAlignRequest) {
      const sideLabel = manualAlignRequest.side === 'left' ? '左' : '右'
      return {
        tone: 'warning',
        label: manualAlignRequest.lineNumber == null
          ? `已进入手动对齐：先点${sideLabel}侧锚点行，再点另一侧目标行，Esc 取消`
          : `已选${sideLabel}侧第 ${manualAlignRequest.lineNumber} 行；可先点本侧修正锚点，再点另一侧完成，Esc 取消`,
      }
    }
    if (manualAlignments.length > 0) {
      return {
        tone: 'idle',
        label: `已启用 ${manualAlignments.length} 组手动对齐，按 ${SHORTCUT.manualAlign} 可继续添加`,
      }
    }
    return null
  }, [manualAlignError, manualAlignRequest, manualAlignments.length])

  // 提示的作者是这个页面，显示它的是壳层里的状态栏——中间没有父子关系，所以经 store
  // 传递。切回目录对比模式时这个页面会被卸载，清理函数保证提示不会留在状态栏上。
  useEffect(() => {
    setStatusHint(statusHint)
  }, [setStatusHint, statusHint])

  useEffect(() => () => setStatusHint(null), [setStatusHint])

  const startManualAlign = useCallback((side: ManualAlignRequest['side'], lineNumber: number | null) => {
    if (!result) {
      return
    }

    setManualAlignError(null)
    setManualAlignRequest({ side, lineNumber })
  }, [result])

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

  const clearManualAlignments = useCallback(() => {
    setManualAlignments([])
    setManualAlignRequest(null)
    setManualAlignError(null)
  }, [])

  /**
   * `⋯ → 从文件载入…`：把「拖入面板」这条一直存在的路径补上一个键盘可达的入口。
   * 读文件用的是同一个 `readFileAsText`，文件名同样成为该侧的标签，失败文案也一致。
   */
  const requestFileLoad = useCallback((side: TextDiffSide) => {
    loadTargetSideRef.current = side
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // 同一个文件连选两次也要能触发 change，所以每次都把 input 清空。
    event.target.value = ''
    if (!file) return

    const side = loadTargetSideRef.current
    const apply = side === 'left' ? setLeftText : setRightText
    try {
      apply(await readFileAsText(file), file.name)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '读取文件失败'
      apply(`[读取失败: ${msg}]`, file.name)
    }
  }, [setLeftText, setRightText])

  const hasManualAlignState = manualAlignRequest != null || manualAlignments.length > 0

  /**
   * §2.2 / §4.5 的文本工具栏 `⋯`：手动对齐（`⇧ Mod L`）· 清除手动对齐 · 从文件载入…
   * 高频的三个控件（交换 / 清空 / 字符对比）留在栏上，其余一律降到这里。
   */
  const overflowItems = useMemo<MenuItem[]>(() => [
    {
      id: 'manual-align',
      label: '手动对齐',
      icon: Rows3,
      shortcut: SHORTCUT.manualAlign,
      // 没有对比结果时行号还没有对应的 diff 行，锚点无处可落——和 `⇧ Mod L` 同款判断。
      disabled: !result,
      onSelect: () => startManualAlign('left', null),
    },
    {
      id: 'clear-manual-align',
      label: '清除手动对齐',
      icon: X,
      disabled: !hasManualAlignState,
      onSelect: clearManualAlignments,
    },
    { kind: 'separator', id: 'text-overflow-sep' },
    {
      kind: 'submenu',
      id: 'load-file',
      label: '从文件载入…',
      icon: FileInput,
      items: [
        { id: 'load-file-left', label: '左侧', onSelect: () => requestFileLoad('left') },
        { id: 'load-file-right', label: '右侧', onSelect: () => requestFileLoad('right') },
      ],
    },
  ], [clearManualAlignments, hasManualAlignState, requestFileLoad, result, startManualAlign])

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
    <div className="flex h-full flex-col">
      {/*
        §4.5：手写的 flex 行换成共享 `Toolbar`。标题恒在（不像旧行那样只有控件），
        副标题就是那句差异摘要，`⋯` 收走手动对齐那一组。
      */}
      <Toolbar
        sticky={false}
        title="文本对比"
        subtitle={diffSummary
          ? diffSummary.hasDiff
            ? `左侧 ${diffSummary.leftChanges} 行变化 · 右侧 ${diffSummary.rightChanges} 行变化`
            : '两侧内容一致'
          : '等待输入文本'}
        overflow={overflowItems}
        actions={
          <>
            <Button size="sm" icon={ArrowLeftRight} disabled={!hasText} onClick={swap}>交换</Button>
            <Button size="sm" icon={Eraser} disabled={!hasText} onClick={clear}>清空</Button>
            {/* 立即生效的布尔开关，不属于任何带保存按钮的表单——按 §10 是 `Switch`。 */}
            <Switch
              size="sm"
              label="字符对比"
              checked={charLevel}
              disabled={!result}
              onCheckedChange={toggleCharLevel}
            />
          </>
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => void handleFileInputChange(event)}
      />

      {error ? (
        <Panel tone="danger" role="alert" padded={false} className="mx-2 mt-2 shrink-0 rounded-md">
          <p className="px-3 py-2 text-sm text-danger-text">{error}</p>
        </Panel>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col p-3">
        {/*
          §4.5：两块文本面板可调宽。分隔条同时充当原来的 `gap-2`，
          `TextComparePage.tsx` 里那套同步滚动（`syncPanelScroll`）原封不动。
        */}
        <SplitPane
          className="min-h-0 flex-1"
          storageKey="text-split"
          min={220}
          label="调整左右文本栏宽度"
        >
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
        </SplitPane>
      </div>
    </div>
  )
}
