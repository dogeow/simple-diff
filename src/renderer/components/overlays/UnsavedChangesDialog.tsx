import { useRef, useState } from 'react'
import { useUIStore } from '../../stores/ui-store'
import { getAllDiffTabs, isDiffTabDirty } from '../../utils/unsaved-changes'
import { isDiffTabSideDirty, saveDiffTabSide } from '../../utils/command-actions'
import { Button, Dialog } from '../ui'

export default function UnsavedChangesDialog() {
  const request = useUIStore((state) => state.pendingUnsavedChanges)
  const [saving, setSaving] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const finish = (proceed: boolean) => {
    useUIStore.getState().setPendingUnsavedChanges(null)
    request?.resolve(proceed)
  }
  const save = async () => {
    if (!request) return
    setSaving(true)
    try {
      for (const requested of request.tabs) {
        for (const side of ['left', 'right'] as const) {
          const current = getAllDiffTabs().find((tab) => tab.sessionId === requested.sessionId)
          if (current && isDiffTabSideDirty(current, side) && !await saveDiffTabSide(current, side)) return
        }
      }
      if (!getAllDiffTabs().some((tab) => request.tabs.some((target) => target.sessionId === tab.sessionId) && isDiffTabDirty(tab))) {
        finish(true)
      }
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={request !== null} onOpenChange={(open) => { if (!open) finish(false) }}
      title="有未保存的修改" size="md" initialFocus={cancelRef} dismissible={!saving}
      footer={<>
        <Button ref={cancelRef} disabled={saving} onClick={() => finish(false)}>取消</Button>
        <Button variant="danger-ghost" disabled={saving} onClick={() => finish(true)}>放弃修改并继续</Button>
        <Button variant="primary" loading={saving} onClick={() => void save()}>保存并继续</Button>
      </>}>
      <p className="mb-2 text-sm text-fg-muted">继续操作前，请处理以下文件的修改。</p>
      <ul className="space-y-1 font-mono text-xs text-fg">
        {request?.tabs.map((tab) => <li className="break-all" key={tab.sessionId}>{tab.leftFullPath || tab.rightFullPath || tab.fileName}</li>)}
      </ul>
    </Dialog>
  )
}
