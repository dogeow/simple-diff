import type { CompareTab } from '../stores/app-store'

interface CompareSessionTabsProps {
  readonly compareTabs: readonly CompareTab[]
  readonly activeCompareTabId: string | null
  readonly newCompareActive?: boolean
  readonly onSelectNewCompare: () => void
  readonly onSelectCompareTab: (compareTabId: string) => void
  readonly onCloseCompareTab?: (compareTabId: string) => void
}

export default function CompareSessionTabs({
  compareTabs,
  activeCompareTabId,
  newCompareActive = false,
  onSelectNewCompare,
  onSelectCompareTab,
  onCloseCompareTab,
}: CompareSessionTabsProps) {
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
      <button
        onClick={onSelectNewCompare}
        className={`shrink-0 rounded px-4 py-1.5 text-sm font-medium transition-colors ${
          newCompareActive
            ? 'bg-blue-600 text-white'
            : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
        }`}
      >
        新建对比
      </button>

      {compareTabs.map((tab) => {
        const isActive = activeCompareTabId === tab.id

        return (
          <div key={tab.id} className="group flex shrink-0 items-center">
            <button
              onClick={() => onSelectCompareTab(tab.id)}
              title={tab.title}
              className={`max-w-56 truncate px-4 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
              } ${onCloseCompareTab ? 'rounded-l' : 'rounded'}`}
            >
              {tab.title}
            </button>
            {onCloseCompareTab && (
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  onCloseCompareTab(tab.id)
                }}
                className={`rounded-r px-2 py-1.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-blue-100 hover:text-white'
                    : 'bg-neutral-700 text-neutral-400 hover:bg-neutral-600 hover:text-white'
                }`}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}