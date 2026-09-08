import { useUIStore } from '../stores/ui-store'
import FileDiffSearch from './file-diff/FileDiffSearch'
import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo } from 'react'
import type { DiffTab } from '../stores/app-store'
import { useAppStore } from '../stores/app-store'
import { changeFileDraft, recomputeFileDraft } from '../utils/file-draft'
import { confirmUnsavedChanges, isDiffTabDirty } from '../utils/unsaved-changes'
import { showToast } from '../stores/toast-store'
import { applyDiffRange, groupIntoHunks } from './file-diff-utils'
import { buildHunkMetrics, getVisibleLineWindow } from './file-diff-window'
import { loadDiffTabContents } from '../utils/diff-tab-loader'
import { buildInlineSegments } from '../utils/inline-diff'
import { saveDiffTabSide } from '../utils/command-actions'
import { isTypingTarget } from '../utils/typing-target'
import { Button, EmptyState, Spinner, SplitPane } from './ui'
import FileDiffPane, { DIFF_ROW_HEIGHT } from './file-diff/FileDiffPane'
import FileDiffToolbar from './file-diff/FileDiffToolbar'
import { useSynchronizedDiffScroll } from './file-diff/useSynchronizedDiffScroll'

interface FileDiffViewProps {
  readonly tab: DiffTab
}

const DIFF_OVERSCAN_ROWS = 16

export default function FileDiffView({ tab }: FileDiffViewProps) {
  const searchOpen = useUIStore((state) => state.fileSearchOpen)
  const updateDiffTab = useAppStore((state) => state.updateDiffTab)
  const hasDiffTabSession = useAppStore((state) => state.hasDiffTabSession)
  const {
    leftRef,
    rightRef,
    scrollTop,
    viewportHeight,
    handleScroll,
  } = useSynchronizedDiffScroll(!tab.loading && tab.diffResult !== null)

  const hunks = useMemo(
    () => tab.diffResult
      ? groupIntoHunks(tab.diffResult.leftLines, tab.diffResult.rightLines)
      : [],
    [tab.diffResult],
  )
  const hunkMetrics = useMemo(
    () => buildHunkMetrics(hunks, DIFF_ROW_HEIGHT),
    [hunks],
  )
  const visibleHunkWindow = useMemo(
    () => getVisibleLineWindow({
      rowHeight: DIFF_ROW_HEIGHT,
      metrics: hunkMetrics,
      scrollTop,
      viewportHeight,
      overscanHeight: DIFF_ROW_HEIGHT * DIFF_OVERSCAN_ROWS,
    }),
    [hunkMetrics, scrollTop, viewportHeight],
  )
  const visibleHunkMetrics = visibleHunkWindow.metrics
  const inlineSegments = useMemo(() => tab.diffResult && visibleHunkMetrics.length
    ? buildInlineSegments(tab.diffResult.leftLines, tab.diffResult.rightLines, {
      startIndex: visibleHunkMetrics[0].renderStartIndex,
      endIndex: visibleHunkMetrics[visibleHunkMetrics.length - 1].renderEndIndex,
    }) : null, [tab.diffResult, visibleHunkMetrics])
  const totalDiffHeight = useMemo(
    () => hunkMetrics.length > 0
      ? hunkMetrics[hunkMetrics.length - 1].top + hunkMetrics[hunkMetrics.length - 1].height
      : 0,
    [hunkMetrics],
  )
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
  const diffMarkers = useMemo(() => {
    if (totalDiffHeight === 0) return []
    return diffHunkMetrics.map((metric) => ({
      start: metric.top / totalDiffHeight,
      height: metric.height / totalDiffHeight,
    }))
  }, [diffHunkMetrics, totalDiffHeight])

  const leftDirty = tab.leftContent !== tab.originalLeftContent
  const rightDirty = tab.rightContent !== tab.originalRightContent

  const scrollToDiff = useCallback((direction: 'next' | 'prev') => {
    const container = leftRef.current
    if (!container || diffHunkMetrics.length === 0) return

    const currentTop = container.scrollTop
    const target = direction === 'next'
      ? diffHunkMetrics.find((metric) => metric.top > currentTop + 4)
        ?? diffHunkMetrics[diffHunkMetrics.length - 1]
      : [...diffHunkMetrics].reverse().find((metric) => metric.top < currentTop - 4)
        ?? diffHunkMetrics[0]

    container.scrollTo({ top: target.top, behavior: 'smooth' })
    rightRef.current?.scrollTo({ top: target.top, behavior: 'smooth' })
  }, [diffHunkMetrics, leftRef, rightRef])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return

      const modifierPressed = event.metaKey || event.ctrlKey
      const shouldGoNext =
        modifierPressed && event.altKey && !event.shiftKey && event.key === 'ArrowDown'
      const shouldGoPrev =
        modifierPressed && event.altKey && !event.shiftKey && event.key === 'ArrowUp'

      if (!shouldGoNext && !shouldGoPrev) return

      event.preventDefault()
      scrollToDiff(shouldGoPrev ? 'prev' : 'next')
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

      if (!latestTab?.diffResult || latestTab.computing) return

      const { leftLines, rightLines } = latestTab.diffResult
      const sourceLines = direction === 'left-to-right' ? leftLines : rightLines
      const targetLines = direction === 'left-to-right' ? rightLines : leftLines
      const targetContent = direction === 'left-to-right'
        ? latestTab.rightContent
        : latestTab.leftContent
      const nextTargetContent = applyDiffRange({
        sourceDiffLines: sourceLines,
        targetDiffLines: targetLines,
        targetContent,
        range,
      })
      const leftContent = direction === 'left-to-right'
        ? latestTab.leftContent
        : nextTargetContent
      const rightContent = direction === 'left-to-right'
        ? nextTargetContent
        : latestTab.rightContent

      changeFileDraft(latestTab, { leftContent, rightContent })
    },
    [tab.id, tab.sessionId, updateDiffTab],
  )

  const undo = useCallback(() => {
    const current = useAppStore.getState().diffTabs.find((item) => item.sessionId === tab.sessionId)
    const previous = current?.undoStack?.at(-1)
    if (current && previous && !current.computing) changeFileDraft(current, previous, 'undo')
  }, [tab.sessionId])
  const redo = useCallback(() => {
    const current = useAppStore.getState().diffTabs.find((item) => item.sessionId === tab.sessionId)
    const next = current?.redoStack?.at(-1)
    if (current && next && !current.computing) changeFileDraft(current, next, 'redo')
  }, [tab.sessionId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const ui = useUIStore.getState()
      if (isTypingTarget(event.target) || ui.overlay || ui.pendingUnsavedChanges || ui.pendingDiffTabClose) return
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo(); else undo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  const handleSave = useCallback(
    (side: 'left' | 'right') => saveDiffTabSide(tab, side),
    [tab],
  )

  const handleReload = useCallback(async () => {
    if (isDiffTabDirty(tab) && !await confirmUnsavedChanges([tab])) return
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

    if (!hasDiffTabSession(tab.id, tab.sessionId)) return

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

  useEffect(() => {
    if (tab.loading) return
    if (tab.computing || (!tab.diffResult && !tab.loadError && (tab.contentsLoaded || tab.leftContent || tab.rightContent || isDiffTabDirty(tab)))) void recomputeFileDraft(tab)
    else if (!tab.diffResult && !tab.loadError) void handleReload()
    // Restoration happens once for this document session. Edits schedule their own worker jobs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.sessionId])

  if (tab.loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-fg-muted">
        <Spinner size="sm" />
        加载中...
      </div>
    )
  }

  if (!tab.diffResult) {
    if (tab.computing) return <div className="flex h-full items-center justify-center gap-2 text-sm text-fg-muted"><Spinner size="sm" />计算差异中…</div>
    if (tab.loadError) {
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
      <FileDiffToolbar
        summary={diffSummary}
        leftDirty={leftDirty}
        rightDirty={rightDirty}
        hasLeftSource={tab.leftSource !== null}
        hasRightSource={tab.rightSource !== null}
        onNavigate={scrollToDiff}
        onSave={handleSave}
        computing={tab.computing}
        savingLeft={tab.savingLeft}
        savingRight={tab.savingRight}
        canUndo={Boolean(tab.undoStack?.length)}
        canRedo={Boolean(tab.redoStack?.length)}
        onUndo={undo}
        onRedo={redo}
        onReload={() => void handleReload()}
        onSearch={() => useUIStore.getState().setFileSearchOpen(true)}
      />

      {searchOpen ? <FileDiffSearch result={tab.diffResult}
        onClose={() => useUIStore.getState().setFileSearchOpen(false)}
        onNavigate={(row) => {
          leftRef.current?.scrollTo({ top: row * DIFF_ROW_HEIGHT })
          rightRef.current?.scrollTo({ top: row * DIFF_ROW_HEIGHT })
        }} /> : null}
      <SplitPane
        className="min-h-0 flex-1"
        storageKey="file-diff-split"
        min={240}
        label="调整左右差异栏宽度"
      >
        <FileDiffPane
          side="left"
          path={tab.leftFullPath}
          scrollRef={leftRef}
          lines={leftLines}
          otherLines={rightLines}
          visibleMetrics={visibleHunkMetrics}
          topSpacerHeight={visibleHunkWindow.topSpacerHeight}
          bottomSpacerHeight={visibleHunkWindow.bottomSpacerHeight}
          segmentMap={inlineSegments?.left}
          markers={diffMarkers}
          onScroll={() => handleScroll('left')}
          disabled={tab.computing}
          onApplyRange={(range) => handleApplyRange(range, 'left-to-right')}
        />
        <FileDiffPane
          side="right"
          path={tab.rightFullPath}
          scrollRef={rightRef}
          lines={rightLines}
          otherLines={leftLines}
          visibleMetrics={visibleHunkMetrics}
          topSpacerHeight={visibleHunkWindow.topSpacerHeight}
          bottomSpacerHeight={visibleHunkWindow.bottomSpacerHeight}
          segmentMap={inlineSegments?.right}
          onScroll={() => handleScroll('right')}
          disabled={tab.computing}
          onApplyRange={(range) => handleApplyRange(range, 'right-to-left')}
        />
      </SplitPane>
    </div>
  )
}
