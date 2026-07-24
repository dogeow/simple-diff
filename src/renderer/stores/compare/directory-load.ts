import { joinSourcePath } from '@shared/source-path'
import type { CompareEntry, FileEntry, SourceConfig } from '../../../../shared/types'

/** Resolve absolute path for a subdir relative path given a SourceConfig. */
export function resolveAbsPath(source: SourceConfig, relativePath: string): string {
  return joinSourcePath(source, source.path, relativePath)
}

/** Match two file lists into CompareEntry[] for a given parent relative path. */
export function matchChildren(
  leftList: readonly FileEntry[],
  rightList: readonly FileEntry[],
  parentRelative: string,
): CompareEntry[] {
  const leftMap = new Map<string, FileEntry>()
  for (const e of leftList) leftMap.set(e.name, e)

  const rightMap = new Map<string, FileEntry>()
  for (const e of rightList) rightMap.set(e.name, e)

  const allNames = new Set([...leftMap.keys(), ...rightMap.keys()])
  const entries: CompareEntry[] = []

  for (const name of allNames) {
    const left = leftMap.get(name)
    const right = rightMap.get(name)
    const isDir = left?.isDirectory ?? right?.isDirectory ?? false
    const relativePath = parentRelative ? `${parentRelative}/${name}` : name

    if (left && !right) {
      entries.push({ relativePath, name, isDirectory: isDir, state: 'left_only', left, reasons: [] })
    } else if (!left && right) {
      entries.push({ relativePath, name, isDirectory: isDir, state: 'right_only', right, reasons: [] })
    } else if (left && right) {
      if (!isDir) {
        const reasons: ('size' | 'mtime')[] = []
        if (left.size !== right.size) reasons.push('size')
        if (Math.abs(left.mtime - right.mtime) > 1000) reasons.push('mtime')
        const state = reasons.length > 0 ? 'different' : 'equal'
        entries.push({
          relativePath, name, isDirectory: isDir, state,
          left,
          right,
          reasons: reasons.map((reason) =>
            reason === 'size'
              ? { type: 'size', leftSize: left.size, rightSize: right.size }
              : { type: 'mtime', leftMtime: left.mtime, rightMtime: right.mtime },
          ),
        })
      } else {
        entries.push({
          relativePath, name, isDirectory: isDir, state: 'pending',
          left,
          right,
          reasons: [],
        })
      }
    }
  }

  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return entries
}

export async function loadDirectoryChildren(
  path: string,
  dirEntry: CompareEntry | undefined,
  leftSource: SourceConfig | null,
  rightSource: SourceConfig | null,
): Promise<readonly CompareEntry[]> {
  if (!leftSource && !rightSource) return []

  const leftAbs = leftSource ? resolveAbsPath(leftSource, path) : null
  const rightAbs = rightSource ? resolveAbsPath(rightSource, path) : null

  const fetchLeft = dirEntry?.state !== 'right_only' && leftSource && leftAbs
  const fetchRight = dirEntry?.state !== 'left_only' && rightSource && rightAbs

  const leftP = fetchLeft
    ? window.api.listFiles(leftSource, leftAbs).then((r) => r.success && r.data ? r.data : [])
    : Promise.resolve([] as readonly FileEntry[])
  const rightP = fetchRight
    ? window.api.listFiles(rightSource, rightAbs).then((r) => r.success && r.data ? r.data : [])
    : Promise.resolve([] as readonly FileEntry[])

  const [leftList, rightList] = await Promise.all([leftP, rightP])
  return matchChildren(leftList, rightList, path)
}
