import { useUIStore } from '../../stores/ui-store'
import { ConfirmDialog } from '../ui'

export default function SyncConfirmDialog() {
  const pending = useUIStore((state) => state.pendingSync)
  const finish = (proceed: boolean) => {
    useUIStore.getState().setPendingSync(null)
    pending?.resolve(proceed)
  }
  if (!pending) return null
  const { request } = pending
  const toRight = request.direction === 'left_to_right'
  const from = toRight ? request.leftSource : request.rightSource
  const to = toRight ? request.rightSource : request.leftSource
  const eligible = request.entries.filter((entry) => (entry.state === 'different' && !entry.isDirectory)
    || (toRight ? entry.state === 'left_only' : entry.state === 'right_only'))
  const directories = eligible.filter((entry) => entry.isDirectory).length
  const overwrites = eligible.filter((entry) => !entry.isDirectory && entry.left && entry.right).length
  return <ConfirmDialog open onOpenChange={(open) => { if (!open) finish(false) }}
    title={toRight ? '确认同步到右侧' : '确认同步到左侧'}
    body={<span>本次范围：{eligible.length - directories} 个文件、{directories} 个目录。已知会覆盖 {overwrites} 个文件。</span>}
    subject={`${from.type === 'sftp' ? 'SFTP ' : ''}${from.path}\n→ ${to.type === 'sftp' ? 'SFTP ' : ''}${to.path}`}
    consequence={directories > 0 ? '目录包含其子项，展开后可能还有同名文件需要覆盖。目标侧额外文件会保留。' : '同名文件将被覆盖，目标侧额外文件会保留。'}
    confirmLabel="确认并同步" onConfirm={() => finish(true)} />
}
