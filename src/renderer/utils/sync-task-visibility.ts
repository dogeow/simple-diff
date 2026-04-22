import { trimTrailingSeparators } from '../../../shared/source-path'
import type { SourceConfig, SyncTaskSnapshot } from '../../../shared/types'

function isSameSource(left: SourceConfig, right: SourceConfig): boolean {
  if (left.type !== right.type) {
    return false
  }

  const leftPath = trimTrailingSeparators(left.path)
  const rightPath = trimTrailingSeparators(right.path)

  if (leftPath !== rightPath) {
    return false
  }

  if (left.type === 'sftp' && right.type === 'sftp') {
    return left.configId === right.configId
  }

  return true
}

export function shouldShowSyncTaskInCompare(
  syncTask: SyncTaskSnapshot | null,
  leftSource: SourceConfig | null,
  rightSource: SourceConfig | null,
): boolean {
  if (!syncTask) {
    return false
  }

  if (!leftSource || !rightSource) {
    return true
  }

  return isSameSource(syncTask.leftSource, leftSource)
    && isSameSource(syncTask.rightSource, rightSource)
}