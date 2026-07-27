import { useEffect, useLayoutEffect, useState } from 'react'
import { useSettingsStore, type ThemePreference } from '../stores/settings-store'
import { applyDiffPalette, applyTheme, resolveTheme, getSystemPrefersDark, type ResolvedTheme } from '../utils/theme'

interface ThemeSync {
  /** 三态偏好：system | light | dark。 */
  readonly theme: ThemePreference
  /** 实际生效的主题。 */
  readonly resolvedTheme: ResolvedTheme
  readonly setTheme: (theme: ThemePreference) => void
}

/**
 * 把主题偏好落到 `<html data-theme>` 上，并跟随系统外观变化。
 *
 * 这段 effect 原本长在 `ThemeToggle.tsx` 里（那个按钮做的是二态翻转，一旦点过就再也
 * 选不回 `system`）。按钮已删除，副作用挪到这里，由 `AppShell` 调用一次；
 * `utils/theme.ts` 与 `settings-store` 的三态偏好都未改动。
 */
export function useThemeSync(): ThemeSync {
  const theme = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches)
    setSystemPrefersDark(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useLayoutEffect(() => {
    applyTheme(theme, systemPrefersDark)
  }, [systemPrefersDark, theme])

  return { theme, resolvedTheme: resolveTheme(theme, systemPrefersDark), setTheme }
}

/**
 * 设置 → 对比 → 色盲友好差异色。和主题同源：偏好落到 `<html>` 的一个 data 属性上，
 * 由 `globals.css` 改写 `--ds-diff-{add,del}*`，任何 diff 组件都不用知道这件事。
 */
export function useDiffPaletteSync(): void {
  const colorblindDiff = useSettingsStore((state) => state.colorblindDiff)

  useLayoutEffect(() => {
    applyDiffPalette(colorblindDiff)
  }, [colorblindDiff])
}
