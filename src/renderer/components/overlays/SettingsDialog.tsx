import { useEffect, useMemo, useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import { formatPathFiltersForDisplay, mergeDisplayedPathFilters } from '@shared/path-filter'
import type { StrategyName } from '../../../../shared/types'
import { Badge, Button, Dialog, RadioGroup, Switch, Tabs, Textarea } from '../ui'
import ThemePreferenceSelector from '../ThemePreferenceSelector'
import StrategyChips from '../compare/StrategyChips'
import { useCompareActions } from '../../hooks/useCompare'
import { useSettingsStore } from '../../stores/settings-store'
import { showToast } from '../../stores/toast-store'
import { isFilterAdditionOnly } from '../../utils/filter-change'
import { getRuntimeInfo } from '../../runtime/runtime-info'
import type { HideDotFilter, ViewMode } from '../../stores/compare-store'

type SettingsSection = 'appearance' | 'compare' | 'filters' | 'about'

const SECTIONS: readonly { value: SettingsSection; label: string }[] = [
  { value: 'appearance', label: '外观' },
  { value: 'compare', label: '对比' },
  { value: 'filters', label: '过滤' },
  { value: 'about', label: '关于' },
]

const VIEW_MODE_OPTIONS: readonly { value: ViewMode; label: string }[] = [
  { value: 'split', label: '分栏' },
  { value: 'merged', label: '合并' },
]

const HIDE_DOT_OPTIONS: readonly { value: HideDotFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'files', label: '仅文件' },
  { value: 'dirs', label: '仅目录' },
]

export interface SettingsDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

function Section({ title, hint, children }: {
  readonly title: string
  readonly hint?: string
  readonly children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2 border-b border-border pb-4 last:border-b-0 last:pb-0">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-xs font-semibold tracking-wider text-fg-muted uppercase">{title}</h3>
        {hint ? <p className="text-xs text-fg-subtle">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

/** 设置 → 对比：一个全新工作区的初始值（见 `utils/compare-defaults.ts`）。 */
function CompareSection() {
  const compareDefaults = useSettingsStore((state) => state.compareDefaults)
  const setCompareDefaults = useSettingsStore((state) => state.setCompareDefaults)
  const colorblindDiff = useSettingsStore((state) => state.colorblindDiff)
  const setColorblindDiff = useSettingsStore((state) => state.setColorblindDiff)

  const handleToggleStrategy = (strategy: StrategyName) => {
    const next = [...compareDefaults.strategies]
    const index = next.indexOf(strategy)
    if (index >= 0) next.splice(index, 1)
    else next.push(strategy)
    setCompareDefaults({ strategies: next })
  }

  return (
    <>
      <Section title="默认比较依据" hint="新工作区（没有可恢复的对比标签时）从这些依据开始。">
        <StrategyChips strategies={compareDefaults.strategies} onToggle={handleToggleStrategy} />
        {compareDefaults.strategies.length === 0 ? (
          <p className="text-xs text-warning-text">一个依据都不选时，新对比需要先在设置面板里补一个才能开始。</p>
        ) : null}
      </Section>

      <Section title="默认视图">
        <RadioGroup
          name="default-view-mode"
          aria-label="默认视图"
          variant="segmented"
          value={compareDefaults.viewMode}
          onValueChange={(viewMode) => setCompareDefaults({ viewMode })}
          options={VIEW_MODE_OPTIONS.map(({ value, label }) => ({ value, label }))}
        />
      </Section>

      <Section title="差异配色">
        <Switch
          checked={colorblindDiff}
          onCheckedChange={setColorblindDiff}
          label="色盲友好差异色"
          description="用蓝 / 橙代替绿 / 红。绿红在深色主题下的色觉分离度实测低于可用底线；+ / − 标记始终存在，这里换的只是配色。"
        />
      </Section>

      <Section title="隐藏点文件">
        <div className="flex flex-wrap items-center gap-3">
          <Switch
            checked={compareDefaults.hideDot}
            onCheckedChange={(hideDot) => setCompareDefaults({ hideDot })}
            label="默认隐藏以 . 开头的条目"
          />
          <RadioGroup
            name="default-hide-dot-filter"
            aria-label="默认隐藏点文件范围"
            variant="segmented"
            value={compareDefaults.hideDotFilter}
            onValueChange={(hideDotFilter) => setCompareDefaults({ hideDotFilter })}
            options={HIDE_DOT_OPTIONS.map(({ value, label }) => ({ value, label }))}
          />
        </div>
      </Section>
    </>
  )
}

/**
 * 设置 → 过滤：全局过滤规则。
 *
 * 这里没有用 `RuleEditor`：该原语的契约是 allow + block 一对 glob 列表，而本应用的
 * 过滤模型是纯排除（`shared/path-filter.ts` 里只有 exclude 语义，没有 allow 概念），
 * 挂上去只会多出一个输入即丢弃的死文本框。会话过滤的 `FilterPopover` 出于同样的
 * 原因用的是 `Textarea` + 共享按钮，两边保持同一套交互。
 *
 * 行为逐字保留自 `pages/SettingsPage.tsx`：`mergeDisplayedPathFilters` 合并、
 * `isFilterAdditionOnly` 短路、非纯新增才 `rerunActiveSessionIfRunning()`。
 */
function FiltersSection() {
  const globalPathFilters = useSettingsStore((state) => state.globalPathFilters)
  const setGlobalPathFilters = useSettingsStore((state) => state.setGlobalPathFilters)
  const { rerunActiveSessionIfRunning } = useCompareActions()

  const displayedFilters = useMemo(
    () => formatPathFiltersForDisplay(globalPathFilters),
    [globalPathFilters],
  )
  const [input, setInput] = useState(displayedFilters.join('\n'))

  useEffect(() => {
    setInput(displayedFilters.join('\n'))
  }, [displayedFilters])

  const handleSave = async () => {
    const merged = mergeDisplayedPathFilters(input.split('\n'), globalPathFilters)
    const additionOnly = isFilterAdditionOnly(globalPathFilters, merged)
    setGlobalPathFilters(merged)
    if (!additionOnly) {
      await rerunActiveSessionIfRunning()
    }
    showToast({
      tone: 'success',
      message: '全局过滤已保存',
      description: `当前共 ${merged.length} 条规则`,
    })
  }

  const handleClear = async () => {
    setInput('')
    setGlobalPathFilters([])
    await rerunActiveSessionIfRunning()
    showToast({ tone: 'info', message: '已清空全局过滤规则' })
  }

  // `mergeDisplayedPathFilters` 的输出已经过 `mergePathFilters` 归一，`globalPathFilters`
  // 也是（store 的 setter 就做这件事），所以直接比较即可。
  const dirty = mergeDisplayedPathFilters(input.split('\n'), globalPathFilters).join('\n')
    !== globalPathFilters.join('\n')

  return (
    <Section
      title="全局过滤规则"
      hint="作用于所有新的目录对比；保存时如果当前活动对比仍在运行，会立即按新规则重跑。"
    >
      <div className="flex items-center gap-2">
        <Badge tone="neutral" size="xs" className="tabular-nums">共 {globalPathFilters.length} 条</Badge>
        {dirty ? <Badge tone="warning" size="xs">未保存</Badge> : null}
      </div>

      <p className="text-xs text-fg-muted">
        一行一个；支持目录名（如 <code className="rounded bg-surface-2 px-1 py-0.5 font-mono">node_modules</code>）或路径规则。
      </p>

      <label htmlFor="global-path-filters" className="sr-only">全局过滤规则</label>
      <Textarea
        id="global-path-filters"
        mono
        rows={10}
        spellCheck={false}
        value={input}
        placeholder={'node_modules\n.git\ndist'}
        onChange={(event) => setInput(event.target.value)}
      />

      <div className="flex items-center gap-2">
        <Button variant="primary" icon={Check} onClick={() => void handleSave()}>保存</Button>
        <Button variant="secondary" icon={Trash2} onClick={() => void handleClear()}>清空</Button>
      </div>
    </Section>
  )
}

function AboutSection() {
  const runtime = getRuntimeInfo()
  const capabilities: readonly { label: string; enabled: boolean }[] = [
    { label: 'SFTP 数据源', enabled: runtime.supportsSftp },
    { label: '对比历史', enabled: runtime.supportsHistory },
    { label: '同步队列', enabled: runtime.supportsSync },
    { label: '写回文件', enabled: runtime.supportsWriteBack },
    { label: '系统目录选择', enabled: runtime.supportsNativeFolderSelection },
    { label: '目录拖放', enabled: runtime.supportsDirectoryDragDrop },
  ]

  return (
    <>
      <Section title="Simple Diff" hint="目录与文本对比工具。">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-fg-muted">运行环境</dt>
          <dd className="font-mono text-fg">{runtime.mode}</dd>
        </dl>
      </Section>
      <Section title="当前环境能力" hint="能力关闭时对应入口会自动隐藏或禁用，而不是报错。">
        <div className="flex flex-wrap gap-1.5">
          {capabilities.map(({ label, enabled }) => (
            <Badge key={label} tone={enabled ? 'success' : 'idle'} size="xs">
              {enabled ? '✓' : '—'} {label}
            </Badge>
          ))}
        </div>
      </Section>
    </>
  )
}

/**
 * 蓝图 §4.6 / chunk 8 第 1 条：`pages/SettingsPage.tsx` + `ThemePreferenceSelector`
 * 合成一个 `Dialog(lg)`，四个 `Tabs` 分区。`⌘,`、应用菜单和 `⌘K` 都能打开它。
 */
export default function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [section, setSection] = useState<SettingsSection>('appearance')

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="设置"
      description="外观、对比默认值与全局过滤规则"
      size="lg"
      footer={<Button variant="secondary" onClick={() => onOpenChange(false)}>关闭</Button>}
    >
      <div className="flex flex-col gap-4">
        <Tabs
          aria-label="设置分区"
          variant="underline"
          size="sm"
          value={section}
          onValueChange={(value) => setSection(value as SettingsSection)}
          items={SECTIONS.map(({ value, label }) => ({ value, label }))}
        />

        <div className="flex flex-col gap-4">
          {section === 'appearance' && (
            <Section title="外观" hint="主题偏好三态：跟随系统 / 浅色 / 深色。">
              <ThemePreferenceSelector />
            </Section>
          )}
          {section === 'compare' && <CompareSection />}
          {section === 'filters' && <FiltersSection />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </Dialog>
  )
}
