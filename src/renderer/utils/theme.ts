import type { ThemePreference } from '../stores/settings-store'

export type ResolvedTheme = Exclude<ThemePreference, 'system'>

export function getSystemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveTheme(theme: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (theme === 'system') {
    return systemPrefersDark ? 'dark' : 'light'
  }

  return theme
}

/**
 * DESIGN-SYSTEM §1.5：色盲友好差异色是「一个 store 标志、一个 data 属性、零组件
 * 改动」。改写规则在 `styles/globals.css`。
 */
export function applyDiffPalette(
  colorblind: boolean,
  root: HTMLElement = document.documentElement,
): void {
  if (colorblind) {
    root.dataset.colorblindDiff = 'true'
    return
  }

  delete root.dataset.colorblindDiff
}

export function applyTheme(
  theme: ThemePreference,
  systemPrefersDark: boolean,
  root: HTMLElement = document.documentElement,
): ResolvedTheme {
  const resolvedTheme = resolveTheme(theme, systemPrefersDark)
  root.dataset.theme = resolvedTheme
  root.style.colorScheme = resolvedTheme
  return resolvedTheme
}
