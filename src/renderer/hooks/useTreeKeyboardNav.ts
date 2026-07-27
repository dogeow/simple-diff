import { useCallback, useEffect, useRef, useState } from 'react'
import type { TreeNode, VisibleTreeNodes } from '../utils/tree-utils'

export interface UseTreeKeyboardNavOptions {
  readonly nodes: VisibleTreeNodes
  /** 拥有滚动的容器；焦点行不可见时由它滚过去。 */
  readonly viewportRef: React.RefObject<HTMLElement | null>
  readonly rowHeight: number
  /** 当前渲染窗口，焦点行渲染出来之后才能真正 `focus()`。 */
  readonly renderedRange: { readonly startIndex: number; readonly endIndex: number }
  readonly isExpanded: (node: TreeNode) => boolean
  readonly onToggle: (node: TreeNode) => void
}

export interface TreeKeyboardNav {
  readonly focusedIndex: number
  readonly setFocusedIndex: (index: number) => void
  readonly onKeyDown: (event: React.KeyboardEvent) => void
}

const TYPEAHEAD_RESET_MS = 800

/**
 * 蓝图 §5：目录树在此之前完全是鼠标操作。这里只管**移动焦点**——`Enter`/`Space`
 * 打开、`←`/`→` 折叠展开由 `TreeRow` 自己处理（它会 `preventDefault`，所以这里看到
 * `defaultPrevented` 就直接放行，不会两边都响应）。
 *
 * 焦点用下标而不是路径：树可以有几万行，每次按键都做一次路径查找不划算。
 */
export function useTreeKeyboardNav({
  nodes,
  viewportRef,
  rowHeight,
  renderedRange,
  isExpanded,
  onToggle,
}: UseTreeKeyboardNavOptions): TreeKeyboardNav {
  const [focusedIndex, setFocusedIndexState] = useState(-1)
  const typeahead = useRef({ query: '', at: 0 })

  const setFocusedIndex = useCallback((index: number) => {
    setFocusedIndexState(index)
  }, [])

  // 列表变短（过滤、折叠）时把焦点收回范围内，避免指向一行已经不存在的行。
  useEffect(() => {
    setFocusedIndexState((current) => (current >= nodes.length ? nodes.length - 1 : current))
  }, [nodes])

  useEffect(() => {
    if (focusedIndex < 0) return
    const viewport = viewportRef.current
    if (viewport) {
      const top = focusedIndex * rowHeight
      if (top < viewport.scrollTop) {
        viewport.scrollTop = top
      } else if (top + rowHeight > viewport.scrollTop + viewport.clientHeight) {
        viewport.scrollTop = top + rowHeight - viewport.clientHeight
      }
    }
    if (focusedIndex < renderedRange.startIndex || focusedIndex >= renderedRange.endIndex) return
    const row = viewportRef.current?.querySelector<HTMLElement>(`[data-tree-index="${focusedIndex}"]`)
    if (row && row !== document.activeElement) row.focus()
  }, [focusedIndex, renderedRange.endIndex, renderedRange.startIndex, rowHeight, viewportRef])

  const parentIndexOf = useCallback((index: number): number => {
    const node = nodes.get(index)
    if (!node || node.depth === 0) return -1
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = nodes.get(i)
      if (candidate && candidate.depth < node.depth) return i
    }
    return -1
  }, [nodes])

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    // `TreeRow` 已经处理掉的键（Enter/Space、展开/折叠）不再重复响应。
    if (event.defaultPrevented || nodes.length === 0) return

    const current = focusedIndex < 0 ? 0 : focusedIndex
    const move = (index: number) => {
      event.preventDefault()
      setFocusedIndexState(Math.max(0, Math.min(nodes.length - 1, index)))
    }

    switch (event.key) {
      case 'ArrowDown':
        move(focusedIndex < 0 ? 0 : current + 1)
        return
      case 'ArrowUp':
        move(focusedIndex < 0 ? 0 : current - 1)
        return
      case 'Home':
        move(0)
        return
      case 'End':
        move(nodes.length - 1)
        return
      case 'ArrowLeft': {
        // 行只在“已展开的目录”上自己处理 `←`；其余情况是“跳到父节点”。
        const parent = parentIndexOf(current)
        if (parent >= 0) move(parent)
        return
      }
      case 'ArrowRight': {
        const node = nodes.get(current)
        if (!node) return
        if (node.isDirectory && !isExpanded(node)) {
          event.preventDefault()
          onToggle(node)
          return
        }
        const next = nodes.get(current + 1)
        if (next && next.depth > node.depth) move(current + 1)
        return
      }
      default:
        break
    }

    if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return

    const now = Date.now()
    typeahead.current.query = now - typeahead.current.at > TYPEAHEAD_RESET_MS
      ? event.key
      : typeahead.current.query + event.key
    typeahead.current.at = now
    const query = typeahead.current.query.toLowerCase()
    const startAt = typeahead.current.query.length > 1 ? current : current + 1

    for (let offset = 0; offset < nodes.length; offset += 1) {
      const index = (startAt + offset + nodes.length) % nodes.length
      if (nodes.get(index)?.name.toLowerCase().startsWith(query)) {
        move(index)
        return
      }
    }
  }, [focusedIndex, isExpanded, nodes, onToggle, parentIndexOf])

  return { focusedIndex, setFocusedIndex, onKeyDown }
}
