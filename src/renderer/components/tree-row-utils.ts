import type { CompareEntry, CompareState } from '../../../shared/types'
import type { DiffKind } from './ui'

const UNRESOLVED_COMPARE_STATES = new Set<CompareState>(['pending', 'comparing'])

/**
 * chunk 7：树行高从 40px 降到 `--ds-row-tree`（DESIGN-SYSTEM §2）。虚拟滚动的
 * 行高常量必须和 CSS 令牌是同一个数字，否则占位高度和真实行高会漂移。
 */
export const TREE_ROW_HEIGHT = 24

/** 24px 行下保持约 380px 的过扫描（原来是 12 行 × 40px）。 */
export const TREE_OVERSCAN_ROWS = 16

export const SELECTED_ROW_BG = 'bg-selected ring-1 ring-inset ring-accent/25 shadow-[inset_2px_0_0_var(--ds-accent)]'

function addAncestorPaths(paths: Set<string>, relativePath: string): void {
  const segments = relativePath.split('/')
  for (let index = 1; index < segments.length; index += 1) {
    paths.add(segments.slice(0, index).join('/'))
  }
}

export function collectBusyDirectoryPaths(
  entries: readonly Pick<CompareEntry, 'relativePath' | 'isDirectory' | 'state'>[],
  loadingDirs: ReadonlySet<string>,
): ReadonlySet<string> {
  const busyPaths = new Set<string>(loadingDirs)

  for (const path of loadingDirs) {
    addAncestorPaths(busyPaths, path)
  }

  for (const entry of entries) {
    if (!UNRESOLVED_COMPARE_STATES.has(entry.state)) continue

    if (entry.isDirectory) {
      busyPaths.add(entry.relativePath)
    }
    addAncestorPaths(busyPaths, entry.relativePath)
  }

  return busyPaths
}

export function hasLoadingDescendantDirectory(
  relativePath: string,
  loadingDirs: ReadonlySet<string>,
): boolean {
  for (const loadingDir of loadingDirs) {
    if (loadingDir === relativePath) return true
    if (relativePath !== '' && loadingDir.startsWith(`${relativePath}/`)) return true
  }

  return false
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatTime(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * 行底色只是符号的补强（§4.3）。用 `--color-diff-*-bg` 而不是图表色，色盲友好开关
 * 才能连底色一起换掉——否则符号变成蓝/橙，底色还留着绿/红。
 */
export function rowBg(state: CompareState): string {
  switch (state) {
    case 'different': return 'bg-diff-mod-bg'
    case 'left_only': return 'bg-diff-del-bg'
    case 'right_only': return 'bg-diff-add-bg'
    case 'comparing': return 'bg-running-quiet'
    default: return ''
  }
}

/**
 * 行的差异符号。DESIGN-SYSTEM §1.5：绿/红在深色下的色盲分离度只有 ΔE 5.6，低于
 * ΔE 6 的下限，所以 `+ − ~` 字形（而不是底色）才是信号，每一行都必须有。
 *
 * 两侧共用同一个映射：`left_only` 在左栏也是 `−`（右边会少这个文件），
 * `right_only` 在右栏也是 `+`，这样同一行在两栏里读到的是同一件事。
 */
export function diffKindForState(state: CompareState): DiffKind {
  switch (state) {
    case 'different': return 'mod'
    case 'left_only': return 'del'
    case 'right_only': return 'add'
    default: return 'same'
  }
}

export function shouldShowDirectorySpinner(
  isDirectory: boolean,
  loading: boolean,
  state: CompareState,
): boolean {
  return isDirectory && (loading || state === 'pending' || state === 'comparing')
}
