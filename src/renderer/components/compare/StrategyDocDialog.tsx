import { Dialog } from '../ui'

interface StrategyDocDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

const STRATEGY_DOCS: ReadonlyArray<{ readonly title: string; readonly body: string }> = [
  {
    title: '文件大小',
    body: '直接比较两侧文件字节数。只要大小不同，就会记录为差异；速度最快，但无法识别同大小不同内容的文件。',
  },
  {
    title: '修改时间',
    body: '比较最后修改时间，内部带 2 秒容差，用来兼容不同文件系统或传输链路的时间精度偏差。',
  },
  {
    title: '快速内容签名',
    body: '小文件直接取全量范围，大文件只读取首尾各 64 KB 计算签名。只要一侧是 SFTP，会改成顺序读取，避免远程随机读放大延迟。',
  },
  {
    title: '内容哈希',
    body: '对整文件计算完整哈希。准确性最高，但本地大文件和远程文件都会有更高读取成本。',
  },
]

/**
 * 原 `HomePage.tsx:306-347`。随 chunk 5 一起搬出来，入口挂在 setup 面板的
 * 「策略说明…」链接上；chunk 8 会把它同时挂到「比较依据 ▾」弹层的页脚。
 */
export default function StrategyDocDialog({ open, onOpenChange }: StrategyDocDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="对比策略实现细节"
      description="当前实现会按你勾选的顺序执行所有策略，并汇总全部命中原因，不会在首个差异处提前停止。"
      footer={
        <p className="mr-auto text-xs leading-5 text-fg-muted">
          历史结果复用只会在路径、目录类型、文件大小和修改时间都一致时跳过重复计算；它是重扫后的缓存复用，不是实时监听。
        </p>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {STRATEGY_DOCS.map((doc) => (
          <section key={doc.title} className="rounded-lg border border-border bg-surface p-3">
            <div className="text-sm font-medium text-fg">{doc.title}</div>
            <div className="mt-1 text-xs leading-5 text-fg-muted">{doc.body}</div>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
