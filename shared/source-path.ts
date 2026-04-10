import type { SourceConfig, SourceType } from './types'

function getSourceType(source: SourceConfig | SourceType): SourceType {
  return typeof source === 'string' ? source : source.type
}

function isWindowsLikePath(path: string): boolean {
  return path.includes('\\') || /^[A-Za-z]:([\\/]|$)/.test(path)
}

function normalizeRelativePath(relativePath: string, separator: '/' | '\\'): string {
  return relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .join(separator)
}

function trimTrailingSeparators(path: string): string {
  if (!path) return path
  if (/^[\\/]+$/.test(path)) return path[0]
  if (/^[A-Za-z]:[\\/]*$/.test(path)) return path.slice(0, 2)
  return path.replace(/[\\/]+$/g, '')
}

export function joinSourcePath(source: SourceConfig | SourceType, basePath: string, relativePath: string): string {
  const sourceType = getSourceType(source)
  if (!relativePath) return basePath

  if (sourceType === 'sftp') {
    const normalizedRelative = normalizeRelativePath(relativePath, '/')
    if (!basePath) return normalizedRelative
    if (/^[\\/]+$/.test(basePath)) return `/${normalizedRelative}`
    return `${trimTrailingSeparators(basePath)}/${normalizedRelative}`
  }

  const separator = isWindowsLikePath(basePath) ? '\\' : '/'
  const normalizedRelative = normalizeRelativePath(relativePath, separator)
  if (!basePath) return normalizedRelative
  return `${trimTrailingSeparators(basePath)}${separator}${normalizedRelative}`
}

export function resolveSourcePath(source: SourceConfig, relativePath: string): string {
  return joinSourcePath(source, source.path, relativePath)
}
