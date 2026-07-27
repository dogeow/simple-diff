import { useUIStore } from '../stores/ui-store'
import { useCommands } from '../hooks/useCommands'
import { CommandPalette as CommandPaletteSurface } from './ui'

interface CommandPaletteProps {
  readonly open: boolean
  readonly onClose: () => void
}

/**
 * 蓝图 chunk 9 第 2 条：这里只剩接线。
 *
 * 模糊匹配、方向键导航、`scrollIntoView({block:'nearest'})`、分组页脚和「永不为空」
 * 都搬进了共享的 `ui/command-palette.tsx`（PRIMITIVES §18，这个文件原来的实现正是
 * 那份规范的原型）；命令本身来自 `hooks/useCommands.ts`。
 *
 * 注册表只在面板打开时构建：它订阅了半个 compare store，常驻挂载会让流式扫描期间
 * 的每一条 entry 都触发一次壳层重渲染。
 */
export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const commands = useCommands({ enabled: open })

  return (
    <CommandPaletteSurface
      open={open}
      onOpenChange={(next) => {
        if (next) return
        /*
         * 命令自己可能已经把当前叠加层换成了别的（`openOverlay` 直接替换 `overlay`）。
         * 这时不能再调一次 `onClose()`——那会把刚打开的设置 / 历史 / SSH 对话框一起关掉，
         * 于是「被降级的功能都能从 ⌘K 打开」这条规则就名存实亡了。
         */
        if (useUIStore.getState().overlay !== 'palette') return
        onClose()
      }}
      commands={commands}
      placeholder="跳转、执行命令或打开对比标签…"
      emptyMessage="无匹配结果"
    />
  )
}
