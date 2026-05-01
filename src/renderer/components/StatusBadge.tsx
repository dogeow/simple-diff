import type { CompareState } from '../../../shared/types'

const STATE_STYLES: Record<CompareState, { bg: string; text: string; ring: string; label: string }> = {
  pending: { bg: 'bg-neutral-800/60', text: 'text-neutral-400', ring: 'ring-neutral-700/60', label: '待比' },
  comparing: { bg: 'bg-cyan-500/10', text: 'text-cyan-300', ring: 'ring-cyan-500/30', label: '对比中' },
  equal: { bg: 'bg-emerald-500/10', text: 'text-emerald-300', ring: 'ring-emerald-500/30', label: '相同' },
  different: { bg: 'bg-amber-500/10', text: 'text-amber-300', ring: 'ring-amber-500/30', label: '不同' },
  left_only: { bg: 'bg-sky-500/10', text: 'text-sky-300', ring: 'ring-sky-500/30', label: '仅左' },
  right_only: { bg: 'bg-violet-500/10', text: 'text-violet-300', ring: 'ring-violet-500/30', label: '仅右' },
}

interface StatusBadgeProps {
  readonly state: CompareState
  readonly dirty?: boolean
}

export default function StatusBadge({ state, dirty = false }: StatusBadgeProps) {
  if (dirty) {
    return (
      <span
        className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30"
      >
        脏
      </span>
    )
  }

  const style = STATE_STYLES[state]
  return (
    <span
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${style.bg} ${style.text} ${style.ring}`}
    >
      {style.label}
    </span>
  )
}
