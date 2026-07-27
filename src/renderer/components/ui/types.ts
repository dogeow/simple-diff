// Doge Desktop Design System — shared primitive types.
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type { Align, Side } from './_internal/hooks'

/** DESIGN-SYSTEM §2 — control heights map 1:1 to `--ds-control-*`. */
export type ControlSize = 'xs' | 'sm' | 'md' | 'lg'

/** DESIGN-SYSTEM §1.4 — status is reserved; it never means "interactive". */
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'running' | 'idle'

export type StatusTone = 'success' | 'warning' | 'danger' | 'running' | 'idle'

/** DESIGN-SYSTEM §7 — the one long-work state machine. */
export type JobStatus = 'idle' | 'queued' | 'running' | 'done' | 'error' | 'cancelled'

export type MenuItem =
  | {
      kind?: 'item'
      id: string
      label: ReactNode
      icon?: LucideIcon
      shortcut?: string
      onSelect: () => void
      disabled?: boolean
      danger?: boolean
      hint?: ReactNode
    }
  | { kind: 'checkbox'; id: string; label: ReactNode; checked: boolean; onSelect: () => void; disabled?: boolean }
  | { kind: 'separator'; id: string }
  | { kind: 'label'; id: string; label: ReactNode }
  | { kind: 'submenu'; id: string; label: ReactNode; icon?: LucideIcon; items: MenuItem[] }
