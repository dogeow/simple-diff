import { cn } from '../../lib/utils'
import { Button } from './button'
import { Textarea } from './input'
import { Field } from './form'

export type DiffKind = 'add' | 'del' | 'mod' | 'moved' | 'same'

const SIGN: Record<DiffKind, string> = {
  add: '+',
  del: '−',
  mod: '~',
  moved: '⇄',
  same: ' ',
}

const SIGN_TONE: Record<DiffKind, string> = {
  add: 'text-diff-add',
  del: 'text-diff-del',
  mod: 'text-diff-mod',
  moved: 'text-diff-moved',
  same: 'text-diff-same',
}

export interface DiffGutterProps {
  kind: DiffKind
  leftNumber?: number
  rightNumber?: number
  className?: string
}

/**
 * MANDATORY on every diff surface. The measured green/red separation under
 * deuteranopia is ΔE 5.6 in dark — below the ΔE 6 floor — so the sign glyph,
 * not the fill, is the signal (DESIGN-SYSTEM §1.5).
 */
export function DiffGutter({ kind, leftNumber, rightNumber, className }: DiffGutterProps) {
  return (
    <span
      data-diff={kind}
      className={cn('inline-flex shrink-0 items-center gap-2 font-mono text-2xs select-none', className)}
    >
      {leftNumber !== undefined ? (
        <span className="w-8 text-right text-fg-subtle tabular-nums">{leftNumber}</span>
      ) : null}
      {rightNumber !== undefined ? (
        <span className="w-8 text-right text-fg-subtle tabular-nums">{rightNumber}</span>
      ) : null}
      <span aria-hidden className={cn('w-[1ch]', SIGN_TONE[kind])}>
        {SIGN[kind]}
      </span>
    </span>
  )
}

export interface RuleEditorProps {
  scope: 'global' | 'session' | 'folder'
  allow: string
  block: string
  onChange: (next: { allow: string; block: string }) => void
  onSave: () => Promise<void> | void
  state?: { saving: boolean; error?: string; savedAt?: number }
  placeholder?: string
  allowLabel?: React.ReactNode
  blockLabel?: React.ReactNode
  className?: string
}

const SCOPE_HINT: Record<RuleEditorProps['scope'], string> = {
  global: '默认应用于所有新对比',
  session: '仅应用于当前对比会话',
  folder: '仅应用于该目录',
}

/** One glob allow/block editor for every scope; normalize + save state included. */
export function RuleEditor({
  scope,
  allow,
  block,
  onChange,
  onSave,
  state,
  placeholder = 'src/**\nlib/**',
  allowLabel = '仅包含（每行一条 glob）',
  blockLabel = '排除（每行一条 glob）',
  className,
}: RuleEditorProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="text-xs text-fg-subtle">{SCOPE_HINT[scope]}</p>
      <Field label={allowLabel}>
        <Textarea
          mono
          rows={5}
          value={allow}
          placeholder={placeholder}
          onChange={(event) => onChange({ allow: event.target.value, block })}
        />
      </Field>
      <Field label={blockLabel} error={state?.error}>
        <Textarea
          mono
          rows={5}
          value={block}
          placeholder={placeholder}
          onChange={(event) => onChange({ allow, block: event.target.value })}
        />
      </Field>
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" loading={state?.saving} onClick={() => void onSave()}>
          保存
        </Button>
        {state?.savedAt ? <span className="text-xs text-success-text">已保存</span> : null}
      </div>
    </div>
  )
}

/** Split a textarea of glob rules into a normalized, de-duplicated list. */
export function normalizeRules(raw: string): string[] {
  const seen = new Set<string>()
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed) seen.add(trimmed)
  }
  return Array.from(seen)
}
