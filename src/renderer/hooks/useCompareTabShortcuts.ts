import { useEffect } from 'react'
import { isTypingTarget } from '../utils/typing-target'
import { useUIStore } from '../stores/ui-store'
import { matchesShortcut, SHORTCUT_SPECS } from './shortcuts'

export interface CompareTabShortcutHandlers {
  /** ⌘N — 新建对比标签。 */
  readonly onNewCompare: () => void
  /** ⌘1…9 — 跳到第 n 个对比标签（1 基）。 */
  readonly onSelectCompareTabByIndex: (index: number) => void
  /** ⇧⌘W — 关闭当前对比标签。 */
  readonly onCloseActiveCompareTab: () => void
  /** E — 打开数据源编辑对话框（非输入上下文）。 */
  readonly onEditSources: () => void
}

/**
 * 蓝图 §5 中属于**某一个对比标签**的那几个键。挂在 `ComparePage` 上，所以它天然只在
 * 「目录对比」模式生效，而且能用到 `ComparePage` 自己的关闭 / 切换逻辑（关标签要先
 * 取消那个标签正在跑的对比，再恢复下一个标签的快照）。
 *
 * 壳层与作业那一半（`⌘K` / `⌘,` / `⌘J` / `?` / `⌘R` / `⌘.` / `⌘F`）归 chunk 9 的
 * `useGlobalShortcuts()`。两边的和弦都来自同一张 `hooks/shortcuts.ts` 表，
 * 快捷键帮助面板读的也是它。
 *
 * `⌘W` / `⌘0` / `⌥←→`（文件 Diff 标签）在 `useGlobalShortcuts` 里：`⌘W` 关的是
 * 一个可能有未保存修改的文件标签，那条确认路径必须在整个应用里只有一条。
 * 这里的 `⌘1…9` 刻意不含 `⌘0`——`⌘0` 是「回到目录树」。
 */
export function useCompareTabShortcuts({
  onNewCompare,
  onSelectCompareTabByIndex,
  onCloseActiveCompareTab,
  onEditSources,
}: CompareTabShortcutHandlers): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (matchesShortcut(event, SHORTCUT_SPECS.closeCompareTab)) {
        event.preventDefault()
        onCloseActiveCompareTab()
        return
      }

      if (matchesShortcut(event, SHORTCUT_SPECS.newCompare)) {
        event.preventDefault()
        onNewCompare()
        return
      }

      const mod = event.metaKey || event.ctrlKey
      if (mod && !event.shiftKey && !event.altKey && /^[1-9]$/.test(event.key)) {
        event.preventDefault()
        onSelectCompareTabByIndex(Number(event.key))
        return
      }

      // 裸键 `E` 只在没有叠加层、也不在输入框里时生效，否则会在别的对话框上再压一层。
      if (
        matchesShortcut(event, SHORTCUT_SPECS.editSources)
        && !isTypingTarget(event.target)
        && useUIStore.getState().overlay === null
      ) {
        event.preventDefault()
        onEditSources()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCloseActiveCompareTab, onEditSources, onNewCompare, onSelectCompareTabByIndex])
}
