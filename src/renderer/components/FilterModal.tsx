import { useState, useRef, useEffect } from 'react'
import { formatPathFiltersForDisplay, mergeDisplayedPathFilters } from '@shared/path-filter'
import { FilterIcon } from './Icons'

interface FilterModalProps {
  readonly extensionFilter: readonly string[]
  readonly onChange: (filter: readonly string[]) => void | Promise<void>
}

export default function FilterModal({ extensionFilter, onChange }: FilterModalProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState(formatPathFiltersForDisplay(extensionFilter).join('\n'))
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
    const patterns = mergeDisplayedPathFilters(input.split('\n'), extensionFilter)
    void onChange(patterns)
    setOpen(false)
  }

  const handleClear = () => {
    setInput('')
    void onChange([])
    setOpen(false)
  }

  const active = extensionFilter.length > 0
  const buttonLabel = active ? `过滤 (${extensionFilter.length})` : '过滤'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setInput(formatPathFiltersForDisplay(extensionFilter).join('\n'))
          setOpen(!open)
        }}
        className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium leading-none transition-colors ${
          active
            ? 'bg-blue-600 text-white hover:bg-blue-500'
            : 'border border-neutral-700 bg-neutral-800/70 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800'
        }`}
      >
        <FilterIcon width={11} height={11} />
        {buttonLabel}
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-md border border-neutral-700 bg-neutral-850 p-3 shadow-2xl">
          <label className="mb-1.5 block text-[11px] font-medium text-neutral-400">
            排除目录或路径
          </label>
          <p className="mb-2 text-[10px] text-neutral-600">
            一行一个；右键『忽略』会自动写入精确路径规则
          </p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={"node_modules\n.git\ndist"}
            rows={6}
            spellCheck={false}
            className="mb-2 w-full resize-none rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 font-mono text-xs text-neutral-100 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
          />
          <div className="flex gap-2">
            <button
              onClick={handleApply}
              className="h-7 flex-1 rounded-md bg-blue-600 px-2 text-[11px] font-medium leading-none text-white shadow-sm transition-colors hover:bg-blue-500"
            >
              应用
            </button>
            <button
              onClick={handleClear}
              className="h-7 flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 text-[11px] font-medium leading-none text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-700"
            >
              清除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
