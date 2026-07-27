import { RefreshCw } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useCompareActions } from '../hooks/useCompare'
import { useCompareStore } from '../stores/compare-store'
import { Button, EmptyState, Skeleton } from './ui'

interface CompareTreeEmptyProps {
  readonly message: string
  readonly onExtensionFilterChange?: (filter: readonly string[]) => void | Promise<void>
}

/**
 * 两个树视图共用的空态（§7.6：每个空态都必须带一个动作）。
 * 分栏视图以前给的是一个虚线 `∅` 死胡同，合并视图给的是带动作的 `EmptyState`——
 * 同一种“没有行”在两个视图里长得不一样。
 */
export default function CompareTreeEmpty({ message, onExtensionFilterChange }: CompareTreeEmptyProps) {
  const { restartCompare } = useCompareActions()
  const { scanning, filter, extensionFilter, setExtensionFilter, setFilter, strategies } = useCompareStore(
    useShallow((state) => ({
      scanning: state.scanning,
      filter: state.filter,
      extensionFilter: state.extensionFilter,
      setExtensionFilter: state.setExtensionFilter,
      setFilter: state.setFilter,
      strategies: state.strategies,
    })),
  )

  if (scanning) {
    // §7.4：结果是流式到达的，扫描期间给一个已知形状的骨架，而不是一句“没有匹配项”。
    return (
      <div className="p-3" aria-busy="true">
        <Skeleton variant="row" count={8} />
      </div>
    )
  }

  if (filter !== 'all' || extensionFilter.length > 0) {
    return (
      <EmptyState
        variant="no-results"
        size="sm"
        title={message}
        description={`当前有 ${extensionFilter.length} 条会话过滤规则，结果筛选也可能排除了全部条目。`}
        action={
          <Button
            size="sm"
            onClick={() => {
              setFilter('all')
              if (extensionFilter.length === 0) return
              if (onExtensionFilterChange) {
                void onExtensionFilterChange([])
                return
              }
              setExtensionFilter([])
            }}
          >
            清除筛选
          </Button>
        }
      />
    )
  }

  return (
    <EmptyState
      variant="no-selection"
      size="sm"
      title={message}
      description="两侧目录下没有可显示的条目。"
      action={
        <Button size="sm" icon={RefreshCw} disabled={strategies.length === 0} onClick={() => void restartCompare()}>
          重新对比
        </Button>
      }
    />
  )
}
