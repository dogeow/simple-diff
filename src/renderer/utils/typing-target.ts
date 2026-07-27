/**
 * 裸键快捷键（`?`、`E`）在输入上下文里必须让路。
 *
 * 原本长在 `components/AppShell.tsx` 里，chunk 9 把它挪到工具模块：全局快捷键层
 * （`hooks/useGlobalShortcuts.ts`）由 `AppShell` 调用，再从 `AppShell` 反向导入这个
 * 函数就形成了循环依赖。
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
