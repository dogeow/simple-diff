import Modal from './Modal'

interface ShortcutHelpProps {
  readonly open: boolean
  readonly onClose: () => void
}

interface ShortcutGroup {
  readonly title: string
  readonly items: readonly { keys: readonly string[]; label: string }[]
}

const GROUPS: readonly ShortcutGroup[] = [
  {
    title: '全局',
    items: [
      { keys: ['⌘', 'K'], label: '打开命令面板' },
      { keys: ['?'], label: '显示快捷键帮助' },
      { keys: ['Esc'], label: '关闭弹窗 / 取消手动对齐' },
    ],
  },
  {
    title: '目录对比',
    items: [
      { keys: ['⌘', 'Enter'], label: '从主页触发对比' },
      { keys: ['右键'], label: '在文件 / 目录上打开操作菜单' },
      { keys: ['双击'], label: '展开目录 / 打开文件 Diff' },
    ],
  },
  {
    title: '文件 Diff',
    items: [
      { keys: ['F7'], label: '跳到下一个差异' },
      { keys: ['Shift', 'F7'], label: '跳到上一个差异' },
      { keys: ['鼠标悬停'], label: '显示行 / 块应用按钮' },
    ],
  },
  {
    title: '文本对比',
    items: [
      { keys: ['⌘', 'Shift', 'L'], label: '在当前光标行启动手动对齐' },
      { keys: ['点击行号'], label: '选择 / 完成手动对齐' },
    ],
  },
]

export default function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  return (
    <Modal open={open} onClose={onClose} ariaLabel="快捷键帮助" maxWidth="max-w-2xl">
      <div className="flex items-center justify-between border-b border-neutral-700 px-5 py-3">
        <div>
          <div className="text-sm font-semibold text-neutral-100">快捷键</div>
          <div className="text-xs text-neutral-500">⌘ 在 macOS 上为 Command，Windows / Linux 上对应 Ctrl</div>
        </div>
        <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">ESC</kbd>
      </div>
      <div className="grid max-h-[70vh] gap-x-8 gap-y-5 overflow-y-auto px-5 py-4 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              {group.title}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {group.items.map((item) => (
                <li key={item.label} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-neutral-300">{item.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {item.keys.map((key) => (
                      <kbd
                        key={key}
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-neutral-700 bg-neutral-800 px-1.5 font-mono text-[10px] text-neutral-300"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}
