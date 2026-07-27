import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { RadioGroup } from './ui'
import { useSettingsStore, type ThemePreference } from '../stores/settings-store'

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
  { value: 'system', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
]

/**
 * 设计蓝图 §4.6 的「外观」区块：三态偏好收成一行 `RadioGroup variant="segmented"`。
 *
 * 原来是三张 96px 高的卡片（每张带图标底板、标题、说明和一个勾），一个 set-and-forget
 * 的偏好占掉设置页近三分之一。可访问性语义未变：仍是 `role="radiogroup"` + 三个
 * `role="radio"`。`ThemeToggle.tsx` 删除后，这里和顶栏 `⋯ → 主题 ▸` 是同一个三态偏好
 * 的两个入口，都能选回 `system`。
 *
 * 外框（分区标题）由调用方给——chunk 8 之后唯一的挂载点是 `SettingsDialog` 的
 * 「外观」分页，再套一层写着「外观」的 `Panel` 只是重复。
 */
export default function ThemePreferenceSelector() {
  const theme = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-xs font-medium text-fg-muted">主题</span>
      <RadioGroup
        name="theme-preference"
        aria-label="应用主题"
        variant="segmented"
        value={theme}
        onValueChange={setTheme}
        options={THEME_OPTIONS.map(({ value, label, icon }) => ({ value, label, icon }))}
      />
      <span className="text-xs text-fg-subtle">修改立即生效并自动保存</span>
    </div>
  )
}
