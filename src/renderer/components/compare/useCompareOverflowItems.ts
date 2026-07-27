import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  ArrowLeftRight,
  BookOpen,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns2,
  Copy,
  EyeOff,
  Pencil,
  RefreshCw,
} from 'lucide-react'
import type { HideDotFilter, ViewMode } from '../../stores/compare-store'
import { useCompareStore } from '../../stores/compare-store'
import { useUIStore } from '../../stores/ui-store'
import { useCompareJob } from '../../hooks/useCompareJob'
import { SHORTCUT } from '../../hooks/shortcuts'
import { copyComparePathPair, swapCompareSources, toggleExpandAllDirs } from '../../utils/command-actions'
import type { MenuItem } from '../ui'

const VIEW_OPTIONS: readonly { value: ViewMode; label: string }[] = [
  { value: 'split', label: '分栏' },
  { value: 'merged', label: '合并' },
]

const HIDE_DOT_OPTIONS: readonly { value: HideDotFilter; label: string }[] = [
  { value: 'all', label: '全部隐藏' },
  { value: 'files', label: '仅隐藏文件' },
  { value: 'dirs', label: '仅隐藏目录' },
]

/**
 * 工具栏的 `⋯`（蓝图 §2.2 / chunk 6 第 3 条）。
 *
 * 这里装的全是「设一次」的东西：视图模式和隐藏点文件都是按会话持久化的偏好
 * （`compare/initial-state.ts`），不是每次分诊都要碰的开关，所以它们从常驻栏位
 * 降到菜单里。降级不是删除——chunk 9 已经把每一项都注册成了一条 `⌘K` 命令，
 * 而且两边调用的是 `utils/command-actions.ts` 里的**同一批函数**，不会漂移。
 */
export function useCompareOverflowItems(): MenuItem[] {
  const openOverlay = useUIStore((state) => state.openOverlay)
  const { dirtyCount, loading, noStrategies, recompareDirty } = useCompareJob()

  const {
    expandedDirs,
    allDirCount,
    viewMode,
    setViewMode,
    hideDot,
    setHideDot,
    hideDotFilter,
    setHideDotFilter,
  } = useCompareStore(useShallow((state) => ({
    expandedDirs: state.expandedDirs,
    allDirCount: state.entrySummary.allDirCount,
    viewMode: state.viewMode,
    setViewMode: state.setViewMode,
    hideDot: state.hideDot,
    setHideDot: state.setHideDot,
    hideDotFilter: state.hideDotFilter,
    setHideDotFilter: state.setHideDotFilter,
  })))

  const allExpanded = allDirCount > 0 && expandedDirs.size >= allDirCount

  return useMemo<MenuItem[]>(() => [
    {
      id: 'edit-sources',
      label: '编辑数据源…',
      icon: Pencil,
      shortcut: SHORTCUT.editSources,
      onSelect: () => openOverlay('compare-setup'),
    },
    {
      id: 'recompare-dirty',
      label: `重比变更 (${dirtyCount})`,
      icon: RefreshCw,
      disabled: dirtyCount === 0 || loading || noStrategies,
      onSelect: () => void recompareDirty(),
    },
    {
      id: 'expand-all',
      label: allExpanded ? '收起全部目录' : '展开全部目录',
      icon: allExpanded ? ChevronsDownUp : ChevronsUpDown,
      onSelect: toggleExpandAllDirs,
    },
    {
      kind: 'submenu',
      id: 'view-mode',
      label: '视图',
      icon: Columns2,
      items: VIEW_OPTIONS.map((option) => ({
        kind: 'checkbox' as const,
        id: `view-${option.value}`,
        label: option.label,
        checked: viewMode === option.value,
        onSelect: () => setViewMode(option.value),
      })),
    },
    {
      kind: 'submenu',
      id: 'hide-dot',
      label: '隐藏点文件',
      icon: EyeOff,
      items: [
        {
          kind: 'checkbox' as const,
          id: 'hide-dot-off',
          label: '不隐藏',
          checked: !hideDot,
          onSelect: () => setHideDot(false),
        },
        ...HIDE_DOT_OPTIONS.map((option) => ({
          kind: 'checkbox' as const,
          id: `hide-dot-${option.value}`,
          label: option.label,
          checked: hideDot && hideDotFilter === option.value,
          onSelect: () => {
            setHideDotFilter(option.value)
            setHideDot(true)
          },
        })),
      ],
    },
    { id: 'swap', label: '交换左右', icon: ArrowLeftRight, onSelect: swapCompareSources },
    { id: 'copy-pair', label: '复制路径对', icon: Copy, onSelect: () => void copyComparePathPair() },
    { kind: 'separator', id: 'overflow-sep' },
    {
      id: 'strategy-doc',
      label: '对比策略说明…',
      icon: BookOpen,
      onSelect: () => openOverlay('strategy-doc'),
    },
  ], [
    allExpanded,
    dirtyCount,
    hideDot,
    hideDotFilter,
    loading,
    noStrategies,
    openOverlay,
    recompareDirty,
    setHideDot,
    setHideDotFilter,
    setViewMode,
    viewMode,
  ])
}
