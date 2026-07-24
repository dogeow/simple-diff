import { trimTrailingSeparators } from '@shared/source-path'
import type { SSHConfig, SourceConfig } from '../../../shared/types'

function getPathLeaf(path: string): string {
  const normalized = path.replace(/[\\/]+$/g, '')
  const segments = normalized.split(/[\\/]/).filter(Boolean)
  return segments.at(-1) ?? normalized
}

export function isSameSourceConfig(left: SourceConfig, right: SourceConfig): boolean {
  if (left.type !== right.type) {
    return false
  }

  if (trimTrailingSeparators(left.path) !== trimTrailingSeparators(right.path)) {
    return false
  }

  return left.type !== 'sftp' || left.configId === right.configId
}

export function resolveSftpLabel(configId: string, configs: readonly SSHConfig[]): string {
  const config = configs.find((candidate) => candidate.id === configId)
  return config?.label?.trim() || config?.host?.trim() || configId
}

export function formatSourceTag(source: SourceConfig, configs: readonly SSHConfig[]): string {
  if (source.type === 'local') {
    return '本地'
  }

  return `SFTP · ${resolveSftpLabel(source.configId, configs)}`
}

export function formatSourcePathLabel(source: SourceConfig, configs: readonly SSHConfig[]): string {
  if (source.type === 'local') {
    return source.path
  }

  return `${resolveSftpLabel(source.configId, configs)}:${source.path}`
}

export function formatComparePairLabel(
  leftSource: SourceConfig | null,
  rightSource: SourceConfig | null,
  configs: readonly SSHConfig[],
): string | null {
  if (!leftSource || !rightSource) {
    return null
  }

  return `${formatSourcePathLabel(leftSource, configs)} ↔ ${formatSourcePathLabel(rightSource, configs)}`
}

export function formatCompareTabTitleFromSources(
  leftSource: SourceConfig,
  rightSource: SourceConfig,
  configs: readonly SSHConfig[],
): string {
  const leftPrefix = leftSource.type === 'sftp' ? resolveSftpLabel(leftSource.configId, configs) : '本地'
  const rightPrefix = rightSource.type === 'sftp' ? resolveSftpLabel(rightSource.configId, configs) : '本地'
  const leftLeaf = getPathLeaf(leftSource.path) || leftSource.path || '左侧'
  const rightLeaf = getPathLeaf(rightSource.path) || rightSource.path || '右侧'

  return `${leftPrefix}:${leftLeaf} ↔ ${rightPrefix}:${rightLeaf}`
}
