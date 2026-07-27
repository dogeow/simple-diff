import { useCallback, useEffect, useRef } from 'react'
import type { StrategyName } from '../../../../shared/types'
import { useCompareStore } from '../../stores/compare-store'
import { Dialog } from '../ui'
import CompareSetupPanel from './CompareSetupPanel'

interface CompareSetupDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

/** 面板里的控件是直接写 compare store 的；取消时要把这几个字段原样放回去。 */
interface SourceDraft {
  readonly leftSourceType: 'local' | 'sftp'
  readonly rightSourceType: 'local' | 'sftp'
  readonly leftPath: string
  readonly rightPath: string
  readonly leftSSHConfigId: string
  readonly rightSSHConfigId: string
  readonly strategies: readonly StrategyName[]
  readonly extensionFilter: readonly string[]
}

function captureSourceDraft(): SourceDraft {
  const state = useCompareStore.getState()

  return {
    leftSourceType: state.leftSourceType,
    rightSourceType: state.rightSourceType,
    leftPath: state.leftPath,
    rightPath: state.rightPath,
    leftSSHConfigId: state.leftSSHConfigId,
    rightSSHConfigId: state.rightSSHConfigId,
    strategies: [...state.strategies],
    extensionFilter: [...state.extensionFilter],
  }
}

/**
 * F3：结果已经存在之后编辑数据源的完整入口（`⋯ → 编辑数据源…` / `E`）。
 * 与 setup 态是同一个 `CompareSetupPanel`，两个挂载点零分叉。
 *
 * 确认后重跑到**同一个**标签；取消什么都不改——面板的控件没有本地草稿状态，改动
 * 会立刻落到 compare store 上，所以这里在打开时抓一份快照，未提交就关闭时整份放
 * 回去。否则「取消」会留下一个路径栏和结果树对不上的会话。
 */
export default function CompareSetupDialog({ open, onOpenChange }: CompareSetupDialogProps) {
  const draftRef = useRef<SourceDraft | null>(null)
  const submittedRef = useRef(false)

  useEffect(() => {
    if (!open) return
    draftRef.current = captureSourceDraft()
    submittedRef.current = false
  }, [open])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    const draft = draftRef.current
    if (!nextOpen && !submittedRef.current && draft) {
      useCompareStore.setState({
        leftSourceType: draft.leftSourceType,
        rightSourceType: draft.rightSourceType,
        leftPath: draft.leftPath,
        rightPath: draft.rightPath,
        leftSSHConfigId: draft.leftSSHConfigId,
        rightSSHConfigId: draft.rightSSHConfigId,
        strategies: [...draft.strategies],
        extensionFilter: [...draft.extensionFilter],
      })
    }

    onOpenChange(nextOpen)
  }, [onOpenChange])

  const handleSubmitted = useCallback(() => {
    submittedRef.current = true
    onOpenChange(false)
  }, [onOpenChange])

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      size="lg"
      title="编辑数据源"
      description="修改后会在当前对比标签里重新运行；直接关闭则不改动任何内容。"
      bodyClassName="p-0"
    >
      <CompareSetupPanel variant="dialog" onSubmitted={handleSubmitted} />
    </Dialog>
  )
}
