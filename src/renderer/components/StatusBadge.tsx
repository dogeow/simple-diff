import type { CompareState } from '../../../shared/types'

const STATE_STYLES: Record<CompareState, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-neutral-700/50', text: 'text-neutral-500', label: '待比' },
  comparing: { bg: 'bg-cyan-950/40', text: 'text-cyan-300', label: '对比中' },
  equal: { bg: 'bg-green-900/30', text: 'text-green-400', label: '相同' },
  different: { bg: 'bg-rose-950/40', text: 'text-rose-300', label: '不同' },
  left_only: { bg: 'bg-sky-950/40', text: 'text-sky-300', label: '仅左' },
  right_only: { bg: 'bg-violet-950/40', text: 'text-violet-300', label: '仅右' },
}

interface StatusBadgeProps {
  readonly state: CompareState
}

export default function StatusBadge({ state }: StatusBadgeProps) {
  const style = STATE_STYLES[state]
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}
