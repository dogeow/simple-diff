import type { CompareState } from '../../../shared/types'

const STATE_STYLES: Record<CompareState, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-neutral-700/50', text: 'text-neutral-500', label: '待比' },
  comparing: { bg: 'bg-blue-900/30', text: 'text-blue-400', label: '对比中' },
  equal: { bg: 'bg-green-900/30', text: 'text-green-400', label: '相同' },
  different: { bg: 'bg-yellow-900/30', text: 'text-yellow-400', label: '不同' },
  left_only: { bg: 'bg-blue-900/30', text: 'text-blue-400', label: '仅左' },
  right_only: { bg: 'bg-purple-900/30', text: 'text-purple-400', label: '仅右' },
}

interface StatusBadgeProps {
  readonly state: CompareState
}

export default function StatusBadge({ state }: StatusBadgeProps) {
  const style = STATE_STYLES[state]
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      {state === 'comparing' && (
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {style.label}
    </span>
  )
}
