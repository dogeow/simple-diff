import { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CirclePlus, History } from 'lucide-react'
import type { CompareHistoryEntry, SSHConfig } from '../../../shared/types'
import type { CompareTab } from '../stores/app-store'
import { useSSHStore } from '../stores/ssh-store'
import { useUIStore } from '../stores/ui-store'
import { useOpenHistoryPair } from '../hooks/useOpenHistoryPair'
import { getRuntimeInfo } from '../runtime/runtime-info'
import { formatComparePairLabel, formatCompareTabTitleFromSources } from '../utils/source-label'
import { startNewCompareSession } from '../utils/compare-session-navigation'
import { Button, SplitButton, TabStrip, type DocumentTab, type MenuItem } from './ui'
import { cn } from '../lib/utils'

const MAX_RECENT_PAIRS = 8

interface CompareSessionTabsProps {
  readonly compareTabs: readonly CompareTab[]
  readonly activeCompareTabId: string | null
  readonly onSelectCompareTab: (compareTabId: string) => void
  readonly onCloseCompareTab: (compareTabId: string) => void
}

function formatCompareTabTooltip(tab: CompareTab, configs: readonly SSHConfig[]): string {
  return formatComparePairLabel(tab.snapshot.leftSource, tab.snapshot.rightSource, configs) ?? tab.title
}

/**
 * chunk 5 第 5 条：对比会话标签统一走 `TabStrip`，关闭按钮与右键菜单不再依赖调用方
 * 传不传回调（§1.2.4 的“同一个组件在 Home 上悄悄少了两个功能”）。
 *
 * `+ 新建对比 ▾` 是 `SplitButton`，下拉即 F8 的最近对比列表——选中直接开一个
 * **已经在跑**的新标签，不再只是预填表单。
 */
export default function CompareSessionTabs({
  compareTabs,
  activeCompareTabId,
  onSelectCompareTab,
  onCloseCompareTab,
}: CompareSessionTabsProps) {
  const runtime = getRuntimeInfo()
  const [recentPairs, setRecentPairs] = useState<readonly CompareHistoryEntry[]>([])
  const openOverlay = useUIStore((s) => s.openOverlay)
  // F8 的唯一实现，历史叠加层的「重新对比」用的是同一个 hook。
  const openHistoryPair = useOpenHistoryPair()
  const { configs, loadConfigs } = useSSHStore(useShallow((state) => ({
    configs: state.configs,
    loadConfigs: state.loadConfigs,
  })))

  useEffect(() => {
    if (
      configs.length === 0
      && compareTabs.some((tab) => tab.snapshot.leftSource?.type === 'sftp' || tab.snapshot.rightSource?.type === 'sftp')
    ) {
      void loadConfigs()
    }
  }, [compareTabs, configs.length, loadConfigs])

  useEffect(() => {
    if (!runtime.supportsHistory || typeof window.api.listHistory !== 'function') return

    void (async () => {
      const response = await window.api.listHistory()
      if (!response.success || !response.data) return
      setRecentPairs(response.data.slice(0, MAX_RECENT_PAIRS))
    })()
  }, [compareTabs.length, runtime.supportsHistory])

  const buildTabMenu = useCallback((tabId: string): MenuItem[] => {
    const others = compareTabs.filter((tab) => tab.id !== tabId)
    const items: MenuItem[] = [
      { id: 'close', label: '关闭', onSelect: () => onCloseCompareTab(tabId) },
    ]

    if (others.length > 0) {
      items.push({
        id: 'close-others',
        label: '关闭其他',
        onSelect: () => others.forEach((tab) => onCloseCompareTab(tab.id)),
      })
      items.push({
        id: 'close-all',
        label: '关闭全部',
        danger: true,
        onSelect: () => compareTabs.forEach((tab) => onCloseCompareTab(tab.id)),
      })
    }

    return items
  }, [compareTabs, onCloseCompareTab])

  const newCompareMenu: MenuItem[] = [
    ...(recentPairs.length > 0
      ? [
          { kind: 'label' as const, id: 'recent-label', label: '最近对比' },
          ...recentPairs.map((entry): MenuItem => ({
            id: `recent-${entry.id}`,
            label: formatCompareTabTitleFromSources(entry.leftSource, entry.rightSource, configs),
            onSelect: () => openHistoryPair(entry),
          })),
          { kind: 'separator' as const, id: 'recent-separator' },
        ]
      : []),
    { id: 'all-history', label: '全部历史…', icon: History, onSelect: () => openOverlay('history') },
  ]

  const tabs: DocumentTab[] = compareTabs.map((tab) => ({
    id: tab.id,
    title: tab.title,
    tooltip: formatCompareTabTooltip(tab, configs),
    status: tab.snapshot.scanning || tab.snapshot.comparing ? 'running' : tab.snapshot.error ? 'error' : null,
  }))

  // setup 态没有活动标签；此时高亮“新建对比”本身，用户始终知道自己在哪。
  const setupActive = activeCompareTabId === null
  const newCompareClassName = cn(setupActive && 'bg-selected text-fg')

  return (
    <TabStrip
      aria-label="对比标签"
      tabs={tabs}
      activeId={activeCompareTabId}
      onSelect={onSelectCompareTab}
      onClose={onCloseCompareTab}
      onContextMenu={buildTabMenu}
      leading={runtime.supportsHistory ? (
        <SplitButton
          size="sm"
          variant="ghost"
          icon={CirclePlus}
          items={newCompareMenu}
          menuLabel="最近对比"
          className={newCompareClassName}
          onClick={startNewCompareSession}
        >
          新建对比
        </SplitButton>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          icon={CirclePlus}
          className={newCompareClassName}
          onClick={startNewCompareSession}
        >
          新建对比
        </Button>
      )}
    />
  )
}
