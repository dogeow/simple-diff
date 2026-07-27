/**
 * 蓝图 §5 / DESIGN-SYSTEM §8.1 的和弦表。
 *
 * 一份定义同时喂三个地方：`useGlobalShortcuts()` 用它匹配按键，`useCommands()` 用它
 * 给命令行尾挂 `Kbd`，`ShortcutHelp` 用它排版帮助面板。以前这三处各写各的字符串，
 * 帮助面板列出来的键和真正生效的键没有任何机制保证一致。
 */
export interface ShortcutSpec {
  /** 小写后的 `event.key`。 */
  readonly key: string
  /** `⌘`（macOS）或 `Ctrl`（其他平台）。 */
  readonly mod?: boolean
  /** `'any'` 表示不关心 Shift——`?` 在不同键盘布局上要不要 Shift 并不确定。 */
  readonly shift?: boolean | 'any'
  readonly alt?: boolean
  /** `Kbd` / 菜单 `shortcut` 里显示的写法。 */
  readonly display: string
}

function displayMap<T extends Record<string, ShortcutSpec>>(specs: T): { readonly [K in keyof T]: string } {
  const out = {} as { [K in keyof T]: string }
  for (const name of Object.keys(specs) as (keyof T)[]) {
    out[name] = specs[name].display
  }
  return out
}

export const SHORTCUT_SPECS = {
  palette: { key: 'k', mod: true, display: 'Mod K' },
  settings: { key: ',', mod: true, display: 'Mod ,' },
  toggleLog: { key: 'j', mod: true, display: 'Mod J' },
  shortcutHelp: { key: '?', shift: 'any', display: '?' },
  restartCompare: { key: 'r', mod: true, display: 'Mod R' },
  focusFilter: { key: 'f', mod: true, display: 'Mod F' },
  cancelJob: { key: '.', mod: true, display: 'Mod .' },
  newCompare: { key: 'n', mod: true, display: 'Mod N' },
  editSources: { key: 'e', display: 'E' },
  closeCompareTab: { key: 'w', mod: true, shift: true, display: '⇧ Mod W' },
  // `⌘1…9`（跳到第 n 个对比标签）是一段范围而不是单个和弦，匹配留在
  // `useCompareTabShortcuts` 里；这里只提供它的显示写法。
  selectCompareTabByIndex: { key: '1…9', mod: true, display: 'Mod 1…9' },
  // chunk 7 的文件 Diff 组。处理器在 `useGlobalShortcuts`，动作实现在
  // `utils/command-actions.ts`（保存/关闭/回树/循环），和 `⌘K` 里的同名命令同源。
  saveLeft: { key: 's', mod: true, display: 'Mod S' },
  saveRight: { key: 's', mod: true, shift: true, display: '⇧ Mod S' },
  closeDiffTab: { key: 'w', mod: true, display: 'Mod W' },
  backToTree: { key: '0', mod: true, display: 'Mod 0' },
  prevDiffTab: { key: 'arrowleft', alt: true, display: '⌥ ←' },
  nextDiffTab: { key: 'arrowright', alt: true, display: '⌥ →' },
  // 文本对比的手动对齐。处理器不在全局层，而在 `TextInputPanel` 的 textarea 上
  // （蓝图 §5：视图内部的键留在视图里），但和弦本身仍然只在这里定义一次——
  // 文本工具栏 `⋯` 的 `shortcut`、帮助面板和真正的匹配读的都是这一行。
  manualAlign: { key: 'l', mod: true, shift: true, display: '⇧ Mod L' },
} as const satisfies Record<string, ShortcutSpec>

/**
 * 还没有处理器的键**不在**这张表里——快捷键帮助面板直接读这张表，提前登记就等于
 * 在面板里公开一个按了没反应的键。
 *
 * `⌃⇥` 故意缺席：Chromium 把 Ctrl+Tab 留给宿主，Tauri 的 webview 里拿不到它；
 * 循环切换由 `⌥←` / `⌥→` 提供。
 */

/** 显示用字符串，`SHORTCUT.palette === 'Mod K'`。 */
export const SHORTCUT = displayMap(SHORTCUT_SPECS)

export function matchesShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  spec: ShortcutSpec,
): boolean {
  if ((event.metaKey || event.ctrlKey) !== (spec.mod ?? false)) return false
  if (spec.shift !== 'any' && event.shiftKey !== (spec.shift ?? false)) return false
  if (event.altKey !== (spec.alt ?? false)) return false
  return event.key.toLowerCase() === spec.key
}
