import { useEffect, useMemo, useState } from 'react'
import { formatPathFiltersForDisplay, mergeDisplayedPathFilters } from '@shared/path-filter'
import { useCompareActions } from '../hooks/useCompare'
import { useSettingsStore } from '../stores/settings-store'
import { CheckIcon, FilterIcon, TrashIcon } from '../components/Icons'
import { showToast } from '../stores/toast-store'
import { isFilterAdditionOnly } from '../utils/filter-change'
import ThemePreferenceSelector from '../components/ThemePreferenceSelector'

export default function SettingsPage() {
  const globalPathFilters = useSettingsStore((s) => s.globalPathFilters)
  const setGlobalPathFilters = useSettingsStore((s) => s.setGlobalPathFilters)
  const { rerunActiveSessionIfRunning } = useCompareActions()
  const formattedGlobalPathFilters = useMemo(
    () => formatPathFiltersForDisplay(globalPathFilters),
    [globalPathFilters],
  )
  const [input, setInput] = useState(formattedGlobalPathFilters.join('\n'))

  useEffect(() => {
    setInput(formattedGlobalPathFilters.join('\n'))
  }, [formattedGlobalPathFilters])

  const handleSave = async () => {
    const merged = mergeDisplayedPathFilters(input.split('\n'), globalPathFilters)
    const additionOnly = isFilterAdditionOnly(globalPathFilters, merged)
    setGlobalPathFilters(merged)
    if (!additionOnly) {
      await rerunActiveSessionIfRunning()
    }
    showToast({
      tone: 'success',
      message: '全局过滤已保存',
      description: `当前共 ${merged.length} 条规则`,
    })
  }

  const handleClear = async () => {
    setInput('')
    setGlobalPathFilters([])
    await rerunActiveSessionIfRunning()
    showToast({ tone: 'info', message: '已清空全局过滤规则' })
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 pt-6 pb-8">
        <header className="flex flex-col gap-1.5 border-b border-neutral-800 pb-4">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-100">设置</h2>
          <p className="text-xs text-neutral-500">
            全局过滤会作用到所有新的目录对比；如果当前活动对比仍在运行，保存后会立即按新规则重跑。
          </p>
        </header>

        <ThemePreferenceSelector />

        <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-800 text-blue-300">
                <FilterIcon width={13} height={13} />
              </span>
              <label className="text-sm font-medium text-neutral-100">全局过滤规则</label>
            </div>
            <span className="rounded-full bg-neutral-800/80 px-2 py-0.5 text-xs tabular-nums text-neutral-400">
              共 {globalPathFilters.length} 条
            </span>
          </div>

          <p className="mb-2 text-xs text-neutral-500">
            一行一个；支持目录名（如 <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[11px]">node_modules</code>）或路径规则。
          </p>

          {formattedGlobalPathFilters.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5 text-[11px] text-neutral-500">
              {formattedGlobalPathFilters.map((filter) => (
                <span
                  key={filter}
                  className="rounded-full border border-neutral-700 bg-neutral-800/70 px-2 py-0.5 font-mono text-neutral-300"
                >
                  {filter}
                </span>
              ))}
            </div>
          )}

          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={10}
            spellCheck={false}
            className="mb-3 w-full resize-y rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-sm leading-6 text-neutral-100 outline-none transition-colors hover:border-neutral-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-500"
            >
              <CheckIcon width={13} height={13} />
              保存
            </button>
            <button
              onClick={() => void handleClear()}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800/60 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
            >
              <TrashIcon width={13} height={13} />
              清空
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
