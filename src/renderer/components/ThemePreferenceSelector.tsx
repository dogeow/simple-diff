import type { ComponentType, SVGProps } from 'react'
import { useSettingsStore, type ThemePreference } from '../stores/settings-store'
import { CheckIcon, MoonIcon, MonitorIcon, SunIcon } from './Icons'

interface ThemeOption {
  readonly value: ThemePreference
  readonly label: string
  readonly description: string
  readonly Icon: ComponentType<SVGProps<SVGSVGElement>>
}

const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: 'system', label: '跟随系统', description: '自动响应系统外观变化', Icon: MonitorIcon },
  { value: 'light', label: '浅色', description: '适合明亮环境', Icon: SunIcon },
  { value: 'dark', label: '深色', description: '适合低光环境', Icon: MoonIcon },
]

export default function ThemePreferenceSelector() {
  const theme = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-neutral-100">外观</h3>
        <p className="mt-1 text-xs text-neutral-500">选择应用主题，修改会立即生效并自动保存。</p>
      </div>

      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="应用主题">
        {THEME_OPTIONS.map(({ value, label, description, Icon }) => {
          const selected = theme === value

          return (
            <button
              key={value}
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(value)}
              className={`relative flex min-h-24 flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
                selected
                  ? 'border-blue-500 bg-blue-500/10 text-neutral-100 ring-1 ring-blue-500/30'
                  : 'border-neutral-700 bg-neutral-800/50 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800/80'
              }`}
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-md ${
                selected ? 'bg-blue-500/15 text-blue-300' : 'bg-neutral-700/70 text-neutral-400'
              }`}>
                <Icon width={15} height={15} />
              </span>
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="mt-0.5 block text-[11px] text-neutral-500">{description}</span>
              </span>
              {selected && (
                <span className="absolute right-2.5 top-2.5 text-blue-300" aria-hidden="true">
                  <CheckIcon width={13} height={13} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
