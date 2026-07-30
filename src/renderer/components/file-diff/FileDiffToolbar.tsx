import { ChevronDown, ChevronUp, CircleCheck, Save } from 'lucide-react'
import { Badge, Button, StatusDot } from '../ui'
import { SHORTCUT } from '../../hooks/shortcuts'

export interface FileDiffSummary {
  readonly added: number
  readonly removed: number
  readonly hunks: number
}

interface FileDiffToolbarProps {
  readonly summary: FileDiffSummary
  readonly leftDirty: boolean
  readonly rightDirty: boolean
  readonly hasLeftSource: boolean
  readonly hasRightSource: boolean
  readonly onNavigate: (direction: 'next' | 'prev') => void
  readonly onSave: (side: 'left' | 'right') => void
}

export default function FileDiffToolbar({
  summary,
  leftDirty,
  rightDirty,
  hasLeftSource,
  hasRightSource,
  onNavigate,
  onSave,
}: FileDiffToolbarProps) {
  const isModified = leftDirty || rightDirty

  return (
    <div className="flex h-toolbar shrink-0 items-center gap-1.5 border-b border-border bg-surface px-2 text-xs text-fg-muted">
      <Button
        size="sm"
        icon={ChevronUp}
        disabled={summary.hunks === 0}
        title="上一个差异 (Mod ⌥ ↑)"
        onClick={() => onNavigate('prev')}
      >
        上一个差异
      </Button>
      <Button
        size="sm"
        icon={ChevronDown}
        disabled={summary.hunks === 0}
        title="下一个差异 (Mod ⌥ ↓)"
        onClick={() => onNavigate('next')}
      >
        下一个差异
      </Button>

      {summary.hunks > 0 ? (
        <span className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-0.5">
          <span className="inline-flex items-center gap-1 font-mono text-diff-add tabular-nums">
            +{summary.added}
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-diff-del tabular-nums">
            −{summary.removed}
          </span>
          <span className="text-fg-subtle">·</span>
          <span className="tabular-nums text-fg-muted">{summary.hunks} 个差异块</span>
        </span>
      ) : (
        <Badge tone="success" icon={CircleCheck}>两侧内容一致</Badge>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {isModified ? <StatusDot status="warning" label="已修改" /> : null}
        {hasLeftSource ? (
          <Button
            variant={leftDirty ? 'primary' : 'secondary'}
            size="sm"
            icon={Save}
            disabled={!leftDirty}
            title={`保存左侧 (${SHORTCUT.saveLeft})`}
            onClick={() => onSave('left')}
          >
            保存左侧
          </Button>
        ) : null}
        {hasRightSource ? (
          <Button
            variant={rightDirty ? 'primary' : 'secondary'}
            size="sm"
            icon={Save}
            disabled={!rightDirty}
            title={`保存右侧 (${SHORTCUT.saveRight})`}
            onClick={() => onSave('right')}
          >
            保存右侧
          </Button>
        ) : null}
      </div>
    </div>
  )
}
