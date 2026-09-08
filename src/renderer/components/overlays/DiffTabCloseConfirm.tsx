import { useCallback, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../stores/app-store'
import { useUIStore } from '../../stores/ui-store'
import { closeDiffTabs, isDiffTabSideDirty, saveDiffTabSide } from '../../utils/command-actions'
import { Button, Dialog } from '../ui'

/**
 * 「有未保存修改，确定关闭？」
 *
 * DESIGN-SYSTEM §7.5：`window.confirm` 无视主题、字号和焦点环，全部换成
 * `ConfirmDialog`——命名对象走等宽、说清不可逆、默认焦点在“取消”上。
 * 待办放在 `ui-store`，所以 `⌘W`、标签条的 `×` 和右键菜单的批量关闭共用这一个确认。
 */
export default function DiffTabCloseConfirm() {
  const pending = useUIStore((state) => state.pendingDiffTabClose)
  const setPending = useUIStore((state) => state.setPendingDiffTabClose)
  const diffTabs = useAppStore((state) => state.diffTabs)
  const [saving, setSaving] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const unsavedNames = useMemo(() => {
    if (!pending) return []
    return pending
      .map((id) => diffTabs.find((tab) => tab.id === id))
      .filter((tab) => tab !== undefined)
      .filter((tab) => isDiffTabSideDirty(tab, 'left') || isDiffTabSideDirty(tab, 'right'))
      .map((tab) => tab.fileName)
  }, [diffTabs, pending])

  const handleConfirm = useCallback(() => {
    if (pending) closeDiffTabs(pending)
    setPending(null)
  }, [pending, setPending])

  const handleSave = async () => {
    setSaving(true)
    try {
      for (const id of pending ?? []) {
        for (const side of ['left', 'right'] as const) {
          const current = useAppStore.getState().diffTabs.find((tab) => tab.id === id)
          if (current && isDiffTabSideDirty(current, side) && !await saveDiffTabSide(current, side)) return
        }
      }
      handleConfirm()
    } finally { setSaving(false) }
  }

  return (
    <Dialog
      open={pending !== null && unsavedNames.length > 0}
      onOpenChange={(open) => {
        if (!open) setPending(null)
      }}
      initialFocus={cancelRef}
      dismissible={!saving}
      title={unsavedNames.length > 1 ? `关闭 ${unsavedNames.length} 个有修改的文件` : '关闭有修改的文件'}
      footer={<>
        <Button ref={cancelRef} disabled={saving} onClick={() => setPending(null)}>取消</Button>
        <Button variant="danger-ghost" disabled={saving} onClick={handleConfirm}>不保存并关闭</Button>
        <Button variant="primary" loading={saving} onClick={() => void handleSave()}>保存并关闭</Button>
      </>}>
      <p className="text-sm text-fg-muted">以下文件还有未保存的修改：</p>
      <p className="mt-2 whitespace-pre-wrap font-mono text-xs text-fg">{unsavedNames.join('\n')}</p>
    </Dialog>
  )
}
