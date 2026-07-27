import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'
import { useDismiss, useFocusTrap } from './_internal/hooks'
import { Kbd } from './badge'

export type CommandGroup = 'navigate' | 'action' | 'open' | 'settings'

export interface Command {
  id: string
  title: string
  group: CommandGroup
  /** Include zh-CN synonyms so both languages match. */
  keywords?: string
  icon?: LucideIcon
  hint?: React.ReactNode
  shortcut?: string
  disabled?: boolean
  /** Shown instead of executing — never a dead row. */
  disabledReason?: string
  recentAt?: number
  perform: () => void | Promise<void>
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  commands: Command[]
  placeholder?: string
  emptyMessage?: React.ReactNode
}

const GROUP_ORDER: CommandGroup[] = ['navigate', 'action', 'open', 'settings']
const GROUP_LABEL: Record<CommandGroup, string> = {
  navigate: '导航',
  action: '操作',
  open: '打开',
  settings: '设置',
}

/** Fuzzy token match — every whitespace-separated token must appear in the haystack. */
export function matchesQuery(command: Command, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const haystack = `${command.title} ${command.keywords ?? ''}`.toLowerCase()
  return tokens.every((token) => haystack.includes(token))
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
  placeholder = '输入命令或搜索…',
  emptyMessage = '没有匹配的命令',
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useFocusTrap(ref, open, inputRef)
  useDismiss(ref, { onDismiss: () => onOpenChange(false), enabled: open })

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIndex(0)
      setNotice(null)
    }
  }, [open])

  const filtered = useMemo(() => {
    const matched = commands.filter((command) => matchesQuery(command, query))
    if (query.trim()) return matched
    // Never empty: with no query, recents first, then everything else in group order.
    return [...matched].sort((a, b) => (b.recentAt ?? 0) - (a.recentAt ?? 0))
  }, [commands, query])

  const grouped = useMemo(() => {
    const flat: Command[] = []
    const sections: { group: CommandGroup; items: Command[] }[] = []
    for (const group of GROUP_ORDER) {
      const items = filtered.filter((command) => command.group === group)
      if (items.length === 0) continue
      sections.push({ group, items })
      flat.push(...items)
    }
    return { sections, flat }
  }, [filtered])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, grouped])

  if (!open || typeof document === 'undefined') return null

  const run = (command: Command) => {
    if (command.disabled) {
      setNotice(command.disabledReason ?? '当前不可用')
      return
    }
    void command.perform()
    onOpenChange(false)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const total = grouped.flat.length
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (total === 0 ? 0 : (index + 1) % total))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (total === 0 ? 0 : (index - 1 + total) % total))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(Math.max(0, total - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const command = grouped.flat[activeIndex]
      if (command) run(command)
    }
  }

  let cursor = -1

  return createPortal(
    <div className="fixed inset-0 z-palette flex items-start justify-center p-8 pt-[12vh]">
      <div className="absolute inset-0 bg-overlay" aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        onKeyDown={onKeyDown}
        className="relative flex max-h-[60vh] w-full max-w-xl flex-col rounded-xl border border-border-strong bg-raised shadow-overlay"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setNotice(null)
          }}
          placeholder={placeholder}
          aria-label="命令搜索"
          data-focus-inset
          className="h-control-lg w-full rounded-t-xl border-b border-border bg-transparent px-3 text-sm text-fg placeholder:text-fg-subtle"
        />
        <div ref={listRef} role="listbox" aria-label="命令" className="min-h-0 flex-1 overflow-y-auto p-1">
          {grouped.sections.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-fg-muted">{emptyMessage}</p>
          ) : (
            grouped.sections.map((section) => (
              <div key={section.group}>
                <div className="px-2 pt-2 pb-1 text-2xs font-medium text-fg-subtle">{GROUP_LABEL[section.group]}</div>
                {section.items.map((command) => {
                  cursor += 1
                  const index = cursor
                  const active = index === activeIndex
                  const Icon = command.icon
                  return (
                    <button
                      key={command.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-disabled={command.disabled || undefined}
                      data-active={active}
                      data-focus-inset
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => run(command)}
                      className={cn(
                        'flex h-control-md w-full items-center gap-2 rounded-md px-2 text-left text-sm',
                        command.disabled ? 'text-fg-subtle' : 'text-fg',
                        active && 'bg-selected',
                      )}
                    >
                      {Icon ? <Icon aria-hidden size={14} strokeWidth={1.75} className="text-fg-muted" /> : null}
                      <span className="min-w-0 flex-1 truncate">{command.title}</span>
                      {command.hint ? (
                        <span className="shrink-0 truncate text-xs text-fg-subtle">{command.hint}</span>
                      ) : null}
                      {command.shortcut ? <Kbd>{command.shortcut}</Kbd> : null}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-2xs text-fg-subtle">
          {notice ? (
            <span className="text-warning-text">{notice}</span>
          ) : (
            <>
              <span>
                <Kbd>↑</Kbd> <Kbd>↓</Kbd> 选择
              </span>
              <span>
                <Kbd>Enter</Kbd> 执行
              </span>
              <span>
                <Kbd>Esc</Kbd> 关闭
              </span>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
