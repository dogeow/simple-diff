import { useState, useRef, useEffect } from 'react'

interface FilterModalProps {
  readonly extensionFilter: readonly string[]
  readonly onChange: (filter: readonly string[]) => void
}

export default function FilterModal({ extensionFilter, onChange }: FilterModalProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState(extensionFilter.join('\n'))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleApply = () => {
    const extensions = input
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s.startsWith('.') ? s : `.${s}`))
    onChange(extensions)
    setOpen(false)
  }

  const handleClear = () => {
    setInput('')
    onChange([])
    setOpen(false)
  }

  const active = extensionFilter.length > 0

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setInput(extensionFilter.join('\n'))
          setOpen(!open)
        }}
        className={`rounded px-2 py-1 text-xs transition-colors ${
          active
            ? 'bg-blue-600 text-white hover:bg-blue-500'
            : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
        }`}
      >
        过滤{active ? ` (${extensionFilter.length})` : ''}
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-48 rounded border border-neutral-600 bg-neutral-800 p-3 shadow-xl">
          <label className="mb-1.5 block text-xs text-neutral-400">
            文件后缀名（一行一个）
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={".ts\n.js\n.css"}
            rows={6}
            className="mb-2 w-full resize-none rounded border border-neutral-600 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleApply}
              className="flex-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500"
            >
              应用
            </button>
            <button
              onClick={handleClear}
              className="flex-1 rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-600"
            >
              清除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
