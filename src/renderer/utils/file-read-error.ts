import type { SourceConfig } from '../../../shared/types'
import { useSSHStore } from '../stores/ssh-store'
import { formatSourceTag } from './source-label'

const TRANSIENT_READ_FAILURE_RE = /not connected|channel closed|connection.*lost|connection ended unexpectedly|no response from server|timed out|timeout/i

function formatSourceSummary(source: SourceConfig | null): string {
  if (!source) {
    return '来源'
  }

  return formatSourceTag(source, useSSHStore.getState().configs)
}

function normalizeMessage(message: string | undefined): string {
  return message?.trim() ?? ''
}

export function isTransientFileReadError(rawError: string | undefined): boolean {
  return TRANSIENT_READ_FAILURE_RE.test(normalizeMessage(rawError))
}

function explainReadFailure(message: string): string {
  if (!message) {
    return '请重试；如仍失败，请检查文件是否仍存在以及连接状态。'
  }

  if (/ENOENT|no such file|cannot find/i.test(message)) {
    return '文件不存在，可能刚被移动、删除，或当前路径已变化。'
  }

  if (/EACCES|EPERM|permission denied|permission/i.test(message)) {
    return '当前账号没有读取该文件的权限。'
  }

  if (isTransientFileReadError(message)) {
    return '读取过程已中断或超时，请重试；如仍失败，请检查磁盘或 SSH 连接状态。'
  }

  if (/is a directory|illegal operation on a directory/i.test(message)) {
    return '目标路径是目录，不是普通文本文件。'
  }

  return message
}

export function formatFileReadErrorForUi(
  sideLabel: string,
  source: SourceConfig | null,
  filePath: string,
  rawError: string | undefined,
): string {
  const sourceSummary = formatSourceSummary(source)
  const message = normalizeMessage(rawError)
  const explanation = explainReadFailure(message)
  return `${sideLabel}${sourceSummary}文件读取失败：${filePath}。${explanation}`
}