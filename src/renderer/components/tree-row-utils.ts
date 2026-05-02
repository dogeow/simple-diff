import type { CompareEntry, CompareState } from '../../../shared/types'

const UNRESOLVED_COMPARE_STATES = new Set<CompareState>(['pending', 'comparing'])

export const SELECTED_ROW_BG = 'bg-neutral-800/85 ring-1 ring-inset ring-amber-500/20 shadow-[inset_2px_0_0_rgba(245,158,11,0.55)]'

function addAncestorPaths(paths: Set<string>, relativePath: string): void {
  const segments = relativePath.split('/')
  for (let index = 1; index < segments.length; index += 1) {
    paths.add(segments.slice(0, index).join('/'))
  }
}

export function collectBusyDirectoryPaths(
  entries: readonly Pick<CompareEntry, 'relativePath' | 'isDirectory' | 'state'>[],
  loadingDirs: ReadonlySet<string>,
): ReadonlySet<string> {
  const busyPaths = new Set<string>(loadingDirs)

  for (const path of loadingDirs) {
    addAncestorPaths(busyPaths, path)
  }

  for (const entry of entries) {
    if (!UNRESOLVED_COMPARE_STATES.has(entry.state)) continue

    if (entry.isDirectory) {
      busyPaths.add(entry.relativePath)
    }
    addAncestorPaths(busyPaths, entry.relativePath)
  }

  return busyPaths
}

export function hasLoadingDescendantDirectory(
  relativePath: string,
  loadingDirs: ReadonlySet<string>,
): boolean {
  for (const loadingDir of loadingDirs) {
    if (loadingDir === relativePath) return true
    if (relativePath !== '' && loadingDir.startsWith(`${relativePath}/`)) return true
  }

  return false
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatTime(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function rowBg(state: CompareState): string {
  switch (state) {
    case 'different': return 'bg-amber-500/[0.05]'
    case 'left_only': return 'bg-sky-500/[0.05]'
    case 'right_only': return 'bg-violet-500/[0.05]'
    case 'comparing': return 'bg-cyan-500/[0.04]'
    default: return ''
  }
}

export function shouldShowDirectorySpinner(
  isDirectory: boolean,
  loading: boolean,
  state: CompareState,
): boolean {
  return isDirectory && (loading || state === 'pending' || state === 'comparing')
}
