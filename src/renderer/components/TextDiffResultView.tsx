import { useCallback, useMemo, useRef } from 'react'
import type { DiffLine, TextDiffResult } from '../../../shared/types'
import { buildInlineSegments, type InlineSegment } from '../utils/inline-diff'

interface TextDiffResultViewProps {
  readonly result: TextDiffResult
  readonly leftLabel: string
  readonly rightLabel: string
  readonly charLevel: boolean
}

const LINE_BG: Record<DiffLine['type'], string> = {
  equal: '',
  add: 'bg-green-900/30',
  remove: 'bg-red-900/30',
}

const EMPHASIS_BG: Record<'add' | 'remove', string> = {
  add: 'bg-green-600/50',
  remove: 'bg-red-600/50',
}

export default function TextDiffResultView({
  result,
  leftLabel,
  rightLabel,
  charLevel,
}: TextDiffResultViewProps) {
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)

  const handleScroll = useCallback((source: 'left' | 'right') => {
    if (syncing.current) return
    syncing.current = true
    const from = source === 'left' ? leftRef.current : rightRef.current
    const to = source === 'left' ? rightRef.current : leftRef.current
    if (from && to) {
      to.scrollTop = from.scrollTop
    }
    requestAnimationFrame(() => {
      syncing.current = false
    })
  }, [])

  const segments = useMemo(
    () => (charLevel ? buildInlineSegments(result.leftLines, result.rightLines) : null),
    [charLevel, result],
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-neutral-700">
      <div className="flex shrink-0 border-b border-neutral-700 bg-neutral-800 text-xs">
        <div className="flex-1 truncate border-r border-neutral-700 px-2 py-1 text-neutral-400" title={leftLabel}>
          左侧 {leftLabel && `— ${leftLabel}`}
        </div>
        <div className="flex-1 truncate px-2 py-1 text-neutral-400" title={rightLabel}>
          右侧 {rightLabel && `— ${rightLabel}`}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          ref={leftRef}
          className="flex-1 overflow-auto border-r border-neutral-700 font-mono text-xs"
          onScroll={() => handleScroll('left')}
        >
          {result.leftLines.map((line, i) => (
            <LineRow key={i} line={line} segments={segments?.left.get(i)} />
          ))}
        </div>
        <div
          ref={rightRef}
          className="flex-1 overflow-auto font-mono text-xs"
          onScroll={() => handleScroll('right')}
        >
          {result.rightLines.map((line, i) => (
            <LineRow key={i} line={line} segments={segments?.right.get(i)} />
          ))}
        </div>
      </div>
    </div>
  )
}

interface LineRowProps {
  readonly line: DiffLine
  readonly segments?: readonly InlineSegment[]
}

function LineRow({ line, segments }: LineRowProps) {
  const emphasisClass =
    line.type === 'add' || line.type === 'remove' ? EMPHASIS_BG[line.type] : ''

  return (
    <div className={`flex min-w-full w-max border-b border-neutral-800/30 ${LINE_BG[line.type]}`}>
      <span className="inline-block w-12 shrink-0 select-none border-r border-neutral-800 px-2 py-0.5 text-right text-neutral-500">
        {line.lineNumber >= 0 ? line.lineNumber : ''}
      </span>
      <pre className="min-w-0 whitespace-pre px-2 py-0.5">
        {segments
          ? segments.map((seg, i) =>
              seg.emphasis ? (
                <span key={i} className={emphasisClass}>
                  {seg.text}
                </span>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )
          : line.content}
      </pre>
    </div>
  )
}
