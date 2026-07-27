import { Button, Dialog, Kbd } from './ui'
import { SHORTCUT } from '../hooks/shortcuts'

interface ShortcutHelpProps {
  readonly open: boolean
  readonly onClose: () => void
}

interface ShortcutGroup {
  readonly title: string
  readonly items: readonly { keys: readonly string[]; label: string }[]
}

/**
 * 蓝图 §5 的绑定表（chunk 8 第 7 条，chunk 9 接上快捷键层后重排）。
 *
 * 和弦写法来自 `hooks/shortcuts.ts` —— 全局层匹配按键用的是同一张表，所以这里列出来的
 * 键和真正生效的键不会分叉。**只列有活处理器的绑定**：全局与作业那一组在
 * `hooks/useGlobalShortcuts.ts`，对比标签那一组在 `hooks/useCompareTabShortcuts.ts`，
 * 文件 Diff 组在 `useGlobalShortcuts` 里（`⌘W` / `⌥←→` 在目录树态也要管用），
 * 视图内部的键（`⌘⌥↑↓`、`⌘⇧L`）留在 `FileDiffView` / `TextInputPanel`，
 * 目录树方向键在 `hooks/useTreeKeyboardNav.ts`。
 */
const GROUPS: readonly ShortcutGroup[] = [
  {
    title: '全局',
    items: [
      { keys: SHORTCUT.palette.split(' '), label: '打开命令面板' },
      { keys: SHORTCUT.settings.split(' '), label: '打开设置' },
      { keys: SHORTCUT.toggleLog.split(' '), label: '切换日志面板' },
      { keys: [SHORTCUT.shortcutHelp], label: '显示快捷键帮助' },
      { keys: ['Esc'], label: '关闭最上层弹层 / 取消手动对齐' },
    ],
  },
  {
    title: '对比标签',
    items: [
      { keys: SHORTCUT.newCompare.split(' '), label: '新建对比' },
      { keys: SHORTCUT.selectCompareTabByIndex.split(' '), label: '跳到第 n 个对比标签' },
      { keys: SHORTCUT.closeCompareTab.split(' '), label: '关闭当前对比标签' },
      { keys: [SHORTCUT.editSources], label: '编辑数据源（非输入态）' },
    ],
  },
  {
    title: '对比结果',
    items: [
      { keys: SHORTCUT.restartCompare.split(' '), label: '重启当前对比' },
      { keys: SHORTCUT.cancelJob.split(' '), label: '暂停正在跑的对比或同步' },
      { keys: SHORTCUT.focusFilter.split(' '), label: '打开会话过滤规则' },
      { keys: ['↑', '↓'], label: '在目录树中上下移动焦点' },
      { keys: ['←', '→'], label: '折叠 / 展开目录、跳到父目录' },
      { keys: ['Home', 'End'], label: '跳到第一行 / 最后一行' },
      { keys: ['Enter'], label: '打开聚焦的文件 Diff' },
      { keys: ['字母'], label: '按名称首字母跳转' },
      { keys: ['右键'], label: '在文件 / 目录上打开操作菜单' },
      { keys: ['双击'], label: '展开目录 / 打开文件 Diff' },
      { keys: ['⇧', '点击'], label: '连选一段' },
      { keys: ['Mod', '点击'], label: '增减选择' },
    ],
  },
  {
    title: '文件 Diff',
    items: [
      { keys: SHORTCUT.saveLeft.split(' '), label: '保存左侧' },
      { keys: SHORTCUT.saveRight.split(' '), label: '保存右侧' },
      { keys: SHORTCUT.closeDiffTab.split(' '), label: '关闭当前文件标签' },
      { keys: SHORTCUT.backToTree.split(' '), label: '回到目录树' },
      { keys: SHORTCUT.prevDiffTab.split(' '), label: '上一个文件标签' },
      { keys: SHORTCUT.nextDiffTab.split(' '), label: '下一个文件标签' },
      { keys: ['Mod', '⌥', '↓'], label: '跳到下一个差异' },
      { keys: ['Mod', '⌥', '↑'], label: '跳到上一个差异' },
      { keys: ['悬停 / 聚焦'], label: '显示行 / 块应用按钮' },
    ],
  },
  {
    title: '文本对比',
    items: [
      { keys: SHORTCUT.manualAlign.split(' '), label: '在当前光标行启动手动对齐' },
      { keys: ['点击行号'], label: '选择 / 完成手动对齐' },
    ],
  },
]

export default function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="快捷键"
      description="Mod 在 macOS 上为 ⌘ Command，Windows / Linux 上为 Ctrl"
      size="xl"
      footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}
    >
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-xs font-semibold tracking-wider text-fg-muted uppercase">
              {group.title}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {group.items.map((item) => (
                <li key={item.label} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-fg">{item.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {item.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
