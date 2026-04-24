import { useEffect, useState } from 'react'
import { formatPathFiltersForDisplay, mergeDisplayedPathFilters } from '@shared/path-filter'
import { useCompare } from '../hooks/useCompare'
import { useSettingsStore } from '../stores/settings-store'

export default function SettingsPage() {
  const globalPathFilters = useSettingsStore((s) => s.globalPathFilters)
  const setGlobalPathFilters = useSettingsStore((s) => s.setGlobalPathFilters)
  const { rerunActiveSessionIfRunning } = useCompare()
  const [input, setInput] = useState(formatPathFiltersForDisplay(globalPathFilters).join('\n'))

  useEffect(() => {
    setInput(formatPathFiltersForDisplay(globalPathFilters).join('\n'))
  }, [globalPathFilters])

  const handleSave = async () => {
    setGlobalPathFilters(mergeDisplayedPathFilters(input.split('\n'), globalPathFilters))
    await rerunActiveSessionIfRunning()
  }

  const handleClear = async () => {
    setInput('')
    setGlobalPathFilters([])
    await rerunActiveSessionIfRunning()
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pt-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">设置</h2>
        <p className="text-sm text-neutral-400">
          全局过滤会作用到所有新的目录对比；如果当前活动对比仍在运行，保存后会立即按新规则重跑。
        </p>
      </div>

      <div className="rounded border border-neutral-700 bg-neutral-800/70 p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <label className="text-sm font-medium text-neutral-200">全局过滤规则</label>
          <span className="text-xs text-neutral-500">共 {globalPathFilters.length} 条</span>
        </div>

        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={'node_modules\n.git\ndist'}
          rows={10}
          className="mb-3 w-full resize-y rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500"
        />

        <div className="flex gap-2">
          <button
            onClick={() => void handleSave()}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            保存
          </button>
          <button
            onClick={() => void handleClear()}
            className="rounded bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
          >
            清空
          </button>
        </div>
      </div>
    </div>
  )
}