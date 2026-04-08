import SourceSelector from '../components/SourceSelector'
import FilterModal from '../components/FilterModal'
import { useCompareStore } from '../stores/compare-store'
import { useCompare } from '../hooks/useCompare'
import type { StrategyName } from '../../../shared/types'

const STRATEGY_OPTIONS: { value: StrategyName; label: string }[] = [
  { value: 'size', label: '文件大小' },
  { value: 'mtime', label: '修改时间' },
  { value: 'hash', label: '内容哈希' },
]

export default function HomePage() {
  const store = useCompareStore()
  const { loading, error, runCompare } = useCompare()

  const handleCompare = () => {
    runCompare()
  }

  const toggleStrategy = (name: StrategyName) => {
    const current = [...store.strategies]
    const idx = current.indexOf(name)
    if (idx >= 0) {
      current.splice(idx, 1)
    } else {
      current.push(name)
    }
    store.setStrategies(current)
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pt-8">
      <h2 className="text-lg font-semibold">目录对比</h2>

      <div className="flex flex-col gap-4">
        <SourceSelector
          label="左侧"
          sourceType={store.leftSourceType}
          path={store.leftPath}
          sshConfigId={store.leftSSHConfigId}
          onSourceTypeChange={store.setLeftSourceType}
          onPathChange={store.setLeftPath}
          onSSHConfigIdChange={store.setLeftSSHConfigId}
        />
        <SourceSelector
          label="右侧"
          sourceType={store.rightSourceType}
          path={store.rightPath}
          sshConfigId={store.rightSSHConfigId}
          onSourceTypeChange={store.setRightSourceType}
          onPathChange={store.setRightPath}
          onSSHConfigIdChange={store.setRightSSHConfigId}
        />
      </div>

      {/* Strategy + Filter */}
      <div className="flex items-end gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-neutral-400">对比策略</span>
          <div className="flex gap-3">
            {STRATEGY_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={store.strategies.includes(opt.value)}
                  onChange={() => toggleStrategy(opt.value)}
                  className="accent-blue-500"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <FilterModal
          extensionFilter={store.extensionFilter}
          onChange={store.setExtensionFilter}
        />
      </div>

      {/* Action */}
      <button
        onClick={handleCompare}
        disabled={loading || !store.leftPath || !store.rightPath || store.strategies.length === 0}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        开始对比
      </button>

      {/* Error */}
      {error && (
        <div className="rounded border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  )
}
