import { useEffect, useLayoutEffect, useState } from 'react'
import { useSettingsStore } from '../stores/settings-store'
import { applyTheme, getSystemPrefersDark, resolveTheme } from '../utils/theme'
import { MoonIcon, SunIcon } from './Icons'

export default function ThemeToggle() {
  const theme = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark)
  const resolvedTheme = resolveTheme(theme, systemPrefersDark)
  const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark'

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

  return (
    <button
      onClick={() => setTheme(nextTheme)}
      title={`当前为${resolvedTheme === 'dark' ? '深色' : '浅色'}模式，点击切换到${nextTheme === 'dark' ? '深色' : '浅色'}模式`}
      aria-label={`切换到${nextTheme === 'dark' ? '深色' : '浅色'}模式`}
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
    >
      {resolvedTheme === 'dark'
        ? <SunIcon width={14} height={14} />
        : <MoonIcon width={14} height={14} />}
    </button>
  )
}
