import type { CompareState } from '../../../shared/types'

const STATE_STYLES: Record<CompareState, { bg: string; text: string; ring: string; label: string }> = {
  pending: { bg: 'bg-surface-2', text: 'text-fg-muted', ring: 'ring-border-strong', label: '待比' },
  comparing: { bg: 'bg-running-quiet', text: 'text-running-text', ring: 'ring-running/30', label: '对比中' },
  equal: { bg: 'bg-success-quiet', text: 'text-success-text', ring: 'ring-success/30', label: '相同' },
  different: { bg: 'bg-warning-quiet', text: 'text-warning-text', ring: 'ring-warning/30', label: '不同' },
  left_only: { bg: 'bg-chart-3/15', text: 'text-chart-3', ring: 'ring-chart-3/30', label: '仅左' },
  right_only: { bg: 'bg-chart-2/15', text: 'text-chart-2', ring: 'ring-chart-2/30', label: '仅右' },
}

interface StatusBadgeProps {
  readonly state: CompareState
  readonly dirty?: boolean
}

export default function StatusBadge({ state, dirty = false }: StatusBadgeProps) {
  if (dirty) {
    return (
      <span
        className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-warning-quiet px-2 py-0.5 text-2xs font-medium text-warning-text ring-1 ring-inset ring-warning/30"
      >
        脏
      </span>
    )
  }

  const style = STATE_STYLES[state]
  return (
    <span
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset ${style.bg} ${style.text} ${style.ring}`}
    >
      {style.label}
    </span>
  )
}
