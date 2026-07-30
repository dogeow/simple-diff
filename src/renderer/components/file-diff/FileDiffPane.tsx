import { ArrowLeft, ArrowRight, Copy } from 'lucide-react'
import type { RefObject } from 'react'
import type { DiffLine } from '../../../../shared/types'
import { copyPathToClipboard } from '../../utils/command-actions'
import type { InlineSegment, InlineSegmentMaps } from '../../utils/inline-diff'
import { truncatePath } from '../../utils/tree-utils'
import { canApplyLine, type Hunk } from '../file-diff-utils'
import type { HunkMetric } from '../file-diff-window'
import ScrollGutter, { type GutterMarker } from '../ScrollGutter'
import { DiffGutter, IconButton, type DiffKind } from '../ui'
import type { DiffSide } from './useSynchronizedDiffScroll'

export const DIFF_ROW_HEIGHT = 21

interface FileDiffPaneProps {
  readonly side: DiffSide
  readonly path: string
  readonly scrollRef: RefObject<HTMLDivElement | null>
  readonly lines: readonly DiffLine[]
  readonly otherLines: readonly DiffLine[]
  readonly visibleMetrics: readonly HunkMetric[]
  readonly topSpacerHeight: number
  readonly bottomSpacerHeight: number
  readonly segmentMap?: InlineSegmentMaps['left']
  readonly markers?: readonly GutterMarker[]
  readonly onScroll: () => void
  readonly onApplyRange: (range: { startIndex: number; endIndex: number }) => void
}

export default function FileDiffPane({
  side,
  path,
  scrollRef,
  lines,
  otherLines,
  visibleMetrics,
  topSpacerHeight,
  bottomSpacerHeight,
  segmentMap,
  markers,
  onScroll,
  onApplyRange,
}: FileDiffPaneProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <FileDiffPathHeader side={side} path={path} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-auto font-mono text-xs" onScroll={onScroll}>
          {topSpacerHeight > 0 ? (
            <div aria-hidden="true" style={{ height: `${topSpacerHeight}px` }} />
          ) : null}
          {visibleMetrics.map((metric) => (
            <DiffHunkBlock
              key={metric.hunk.startIndex}
              hunk={metric.hunk}
              lines={lines}
              otherLines={otherLines}
              side={side}
              segmentMap={segmentMap}
              onApplyHunk={() => onApplyRange(metric.hunk)}
              onApplyLine={(lineIndex) => onApplyRange({ startIndex: lineIndex, endIndex: lineIndex + 1 })}
            />
          ))}
          {bottomSpacerHeight > 0 ? (
            <div aria-hidden="true" style={{ height: `${bottomSpacerHeight}px` }} />
          ) : null}
        </div>
        {markers ? <ScrollGutter scrollRef={scrollRef} markers={markers} /> : null}
      </div>
    </div>
  )
}

interface FileDiffPathHeaderProps {
  readonly side: DiffSide
  readonly path: string
}

function FileDiffPathHeader({ side, path }: FileDiffPathHeaderProps) {
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
      {path ? (
        <IconButton
          icon={Copy}
          label="复制完整路径"
          size="xs"
          variant="ghost"
          onClick={() => void copyPathToClipboard(path)}
          className="shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
        />
      ) : null}
    </div>
  )
}

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

interface DiffHunkBlockProps {
  readonly hunk: Hunk
  readonly lines: readonly DiffLine[]
  readonly otherLines: readonly DiffLine[]
  readonly side: DiffSide
  readonly segmentMap?: ReadonlyMap<number, readonly InlineSegment[]>
  readonly onApplyHunk: () => void
  readonly onApplyLine: (lineIndex: number) => void
}

function DiffHunkBlock({
  hunk,
  lines,
  otherLines,
  side,
  segmentMap,
  onApplyHunk,
  onApplyLine,
}: DiffHunkBlockProps) {
  const hunkLines = lines.slice(hunk.startIndex, hunk.endIndex)
  const isMultiLineDiff = hunk.endIndex - hunk.startIndex > 1

  return (
    <div className="group relative">
      {hunk.type === 'diff' ? (
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
      ) : null}

      {hunkLines.map((line, offset) => {
        const lineIndex = hunk.startIndex + offset
        const segments = segmentMap?.get(lineIndex)
        const emphasisClass =
          line.type === 'add' || line.type === 'remove' ? EMPHASIS_BG[line.type] : ''

        return (
          <div
            key={lineIndex}
            className={`group/line flex w-max min-w-full border-b border-border ${LINE_BG[line.type]} ${LINE_EDGE[line.type]}`}
            style={{ height: `${DIFF_ROW_HEIGHT}px` }}
          >
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
            }) ? (
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
            ) : null}
            <pre className="min-w-0 whitespace-pre px-2 py-0.5">
              {segments
                ? segments.map((segment, segmentIndex) =>
                    segment.emphasis ? (
                      <span key={segmentIndex} className={emphasisClass}>
                        {segment.text}
                      </span>
                    ) : (
                      <span key={segmentIndex}>{segment.text}</span>
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
