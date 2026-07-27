import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'
import { useDismiss, useFocusTrap } from './_internal/hooks'
import { Button, IconButton } from './button'
import { Input } from './input'

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZE: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** REQUIRED — wired to `aria-labelledby`. */
  title: React.ReactNode
  description?: React.ReactNode
  size?: DialogSize
  footer?: React.ReactNode
  initialFocus?: React.RefObject<HTMLElement | null>
  /** `false` while a job inside the dialog runs. */
  dismissible?: boolean
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  footer,
  initialFocus,
  dismissible = true,
  className,
  bodyClassName,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  useFocusTrap(ref, open, initialFocus)
  useDismiss(ref, {
    onDismiss: () => dismissible && onOpenChange(false),
    outside: dismissible,
    escape: dismissible,
    enabled: open,
  })

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-dialog flex items-start justify-center p-8 pt-[12vh]">
      <div className="absolute inset-0 bg-overlay" aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          'relative flex max-h-[80vh] w-full flex-col rounded-xl border border-border-strong',
          'bg-raised shadow-overlay',
          SIZE[size],
          className,
        )}
      >
        <header className="flex items-start gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-0.5 text-xs text-fg-muted">
                {description}
              </p>
            ) : null}
          </div>
          {dismissible ? (
            <IconButton icon={X} label="关闭" size="sm" variant="ghost" onClick={() => onOpenChange(false)} />
          ) : null}
        </header>
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-3', bodyClassName)}>{children}</div>
        {footer ? (
          <footer className="flex justify-end gap-2 border-t border-border px-4 py-3">{footer}</footer>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  body?: React.ReactNode
  /** The object being acted on — rendered in mono in a tinted box. */
  subject?: string
  consequence?: React.ReactNode
  tone?: 'default' | 'danger'
  confirmLabel?: React.ReactNode
  cancelLabel?: React.ReactNode
  secondaryConfirm?: { label: React.ReactNode; onConfirm: () => void | Promise<void> }
  /** Must be typed exactly to enable the confirm button. */
  requireTypedConfirmation?: string
  onConfirm: () => void | Promise<void>
}

/** Replaces every native `confirm()`. Focuses Cancel; destructive action last. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  subject,
  consequence,
  tone = 'danger',
  confirmLabel = '确认',
  cancelLabel = '取消',
  secondaryConfirm,
  requireTypedConfirmation,
  onConfirm,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [pending, setPending] = useState(false)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!open) {
      setPending(false)
      setTyped('')
    }
  }, [open])

  const blocked = Boolean(requireTypedConfirmation) && typed !== requireTypedConfirmation

  const run = async (action: () => void | Promise<void>) => {
    setPending(true)
    try {
      await action()
      onOpenChange(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      dismissible={!pending}
      initialFocus={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          {secondaryConfirm ? (
            <Button
              variant={tone === 'danger' ? 'danger-ghost' : 'secondary'}
              loading={pending}
              disabled={blocked || pending}
              onClick={() => void run(secondaryConfirm.onConfirm)}
            >
              {secondaryConfirm.label}
            </Button>
          ) : null}
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={pending}
            disabled={blocked || pending}
            onClick={() => void run(onConfirm)}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 text-sm text-fg">
        {body ? <p>{body}</p> : null}
        {subject ? (
          <p className="rounded-md border border-border bg-inset px-2 py-1.5 font-mono text-xs break-all text-fg">
            {subject}
          </p>
        ) : null}
        {consequence ? <p className="text-xs text-danger-text">{consequence}</p> : null}
        {requireTypedConfirmation ? (
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            输入 <span className="font-mono text-fg">{requireTypedConfirmation}</span> 以确认
            <Input size="sm" mono value={typed} onChange={(event) => setTyped(event.target.value)} />
          </label>
        ) : null}
      </div>
    </Dialog>
  )
}

export interface DrawerProps extends Omit<DialogProps, 'size'> {
  side?: 'right' | 'bottom'
  size?: 'sm' | 'md'
}

const DRAWER_SIZE = {
  right: { sm: 'w-[320px]', md: 'w-[440px]' },
  bottom: { sm: 'h-[240px]', md: 'h-[360px]' },
} as const

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  side = 'right',
  size = 'md',
  footer,
  initialFocus,
  dismissible = true,
  className,
  children,
}: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  useFocusTrap(ref, open, initialFocus)
  useDismiss(ref, {
    onDismiss: () => dismissible && onOpenChange(false),
    outside: dismissible,
    escape: dismissible,
    enabled: open,
  })

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className={cn('fixed inset-0 z-dialog flex', side === 'right' ? 'justify-end' : 'items-end')}>
      <div className="absolute inset-0 bg-overlay" aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          'relative flex flex-col border-border-strong bg-raised shadow-overlay',
          side === 'right' ? cn('h-full border-l', DRAWER_SIZE.right[size]) : cn('w-full border-t', DRAWER_SIZE.bottom[size]),
          className,
        )}
      >
        <header className="flex items-start gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-sm font-semibold text-fg">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-0.5 text-xs text-fg-muted">
                {description}
              </p>
            ) : null}
          </div>
          {dismissible ? (
            <IconButton icon={X} label="关闭" size="sm" variant="ghost" onClick={() => onOpenChange(false)} />
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-border px-3 py-2">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}
