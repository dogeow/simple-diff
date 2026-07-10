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
