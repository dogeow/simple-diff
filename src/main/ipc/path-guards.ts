import * as path from 'path'
import type { SourceConfig } from '@shared/types'
import { normalizePathSegment, resolveSourcePath } from '@shared/source-path'

export function resolveAllowedLocalPath(source: SourceConfig, relativePath: string): string {
  if (source.type !== 'local') {
    throw new Error('当前操作仅支持本地路径')
  }

  const sourceRoot = path.resolve(source.path)
  const inputPath = path.isAbsolute(relativePath) ? relativePath : resolveSourcePath(source, relativePath)
  const resolvedPath = path.resolve(inputPath)
  const relative = path.relative(sourceRoot, resolvedPath)
  if (relative === '' || relative === '.') {
    return resolvedPath
  }
  if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error('文件路径超出允许范围')
  }

  return resolvedPath
}

export function resolveAllowedSourcePath(source: SourceConfig, filePath: string): string {
  if (source.type === 'local') {
    return resolveAllowedLocalPath(source, filePath)
  }

  const sourceRoot = path.posix.resolve(source.path || '/')
  const normalizedInput = filePath.replace(/\\/g, '/')
  const resolvedPath = path.posix.resolve(
    path.posix.isAbsolute(normalizedInput)
      ? normalizedInput
      : path.posix.join(sourceRoot, normalizedInput),
  )
  const relative = path.posix.relative(sourceRoot, resolvedPath)
  if (relative === '' || relative === '.') return resolvedPath
  if (relative === '..' || relative.startsWith(`../`)) {
    throw new Error('文件路径超出允许范围')
  }

  return resolvedPath
}

export function buildRenameTarget(source: SourceConfig, oldRelativePath: string, newName: string): {
  oldPath: string
  newPath: string
} {
  if (oldRelativePath === '') {
    throw new Error('无法重命名根目录')
  }

  const oldPath = resolveAllowedLocalPath(source, oldRelativePath)
  const safeName = normalizePathSegment(newName)
  const parentRelativePath = oldRelativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .slice(0, -1)
    .join('/')

  const newRelativePath = parentRelativePath ? `${parentRelativePath}/${safeName}` : safeName

  return {
    oldPath,
    newPath: resolveSourcePath(source, newRelativePath),
  }
}
