import type { CompareEntry, CompareState } from '../../../shared/types'

/**
 * Truncate path by hiding the middle parts with .../.../
 * - If fits: keep first + all middle dirs + last
 * - If too long: keep only first + last with minimal dots
 * e.g., "/home/user/project/src/components/Button.tsx" -> "/home/.../.../.../components/Button.tsx"
 * e.g., "/Users/very/deep/nested/path/Documents" -> "/Users/.../Documents"
 */
export function truncatePath(path: string, maxLength = 60): string {
  if (path.length <= maxLength) return path

  // Handle sftp paths
  if (path.startsWith('sftp://')) {
    const [protocol, rest] = path.split('://')
    const [configId, filePath] = rest.split(':')
    const truncated = truncateFilePath(filePath, maxLength - protocol.length - configId.length - 4)
    return `${protocol}://${configId}:${truncated}`
  }

  // Handle local paths
  return truncateFilePath(path, maxLength)
}

function truncateFilePath(path: string, maxLength: number): string {
  if (path.length <= maxLength) return path

  const parts = path.split('/').filter((p) => p !== '')
  if (parts.length <= 2) return path // Not worth truncating

  const firstPart = parts[0]
  const lastPart = parts[parts.length - 1]

  // Build path: first + (... for each hidden dir) + last
  const hiddenCount = parts.length - 2 // Number of directories to hide
  const hiddenParts = Array(hiddenCount).fill('...')
  const hiddenPath = hiddenParts.join('/')

  const result = `/${firstPart}/${hiddenPath}/${lastPart}`
  return result
}

export interface TreeNode {
  readonly name: string
  readonly relativePath: string
  readonly isDirectory: boolean
  readonly entry: CompareEntry | null
  readonly children: TreeNode[]
  readonly depth: number
}

export function buildTree(entries: readonly CompareEntry[]): TreeNode {
  const root: TreeNode = {
    name: '',
    relativePath: '',
    isDirectory: true,
    entry: null,
    children: [],
    depth: -1,
  }

  const dirMap = new Map<string, TreeNode>()
  dirMap.set('', root)

  const sorted = [...entries].sort((a, b) => a.relativePath.localeCompare(b.relativePath))

  for (const entry of sorted) {
    const parts = entry.relativePath.split('/')
    const parentPath = parts.slice(0, -1).join('/')

    const node: TreeNode = {
      name: entry.name,
      relativePath: entry.relativePath,
      isDirectory: entry.isDirectory,
      entry,
      children: [],
      depth: parts.length - 1,
    }

    const parent = dirMap.get(parentPath) ?? root
    parent.children.push(node)

    if (entry.isDirectory) {
      dirMap.set(entry.relativePath, node)
    }
  }

  return root
}

export function getVisibleNodes(
  root: TreeNode,
  expandedDirs: ReadonlySet<string>,
): readonly TreeNode[] {
  const result: TreeNode[] = []

  function walk(node: TreeNode): void {
    if (node.depth >= 0) {
      result.push(node)
    }

    if (node.isDirectory && (node.depth < 0 || expandedDirs.has(node.relativePath))) {
      const sorted = [...node.children].sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      for (const child of sorted) {
        walk(child)
      }
    }
  }

  walk(root)
  return result
}

export function getAllDirPaths(entries: readonly CompareEntry[]): ReadonlySet<string> {
  const dirs = new Set<string>()
  for (const entry of entries) {
    if (entry.isDirectory) {
      dirs.add(entry.relativePath)
    }
  }
  return dirs
}

const DIR_STATE_PRIORITY: CompareState[] = ['different', 'left_only', 'right_only', 'comparing', 'pending', 'equal']

/**
 * Compute effective directory states by propagating descendant entry states upward.
 * A directory's effective state is the highest-priority state among its descendants.
 */
export function computeEffectiveDirStates(entries: readonly CompareEntry[]): ReadonlyMap<string, CompareState> {
  const dirStates = new Map<string, Set<CompareState>>()

  for (const entry of entries) {
    const parts = entry.relativePath.split('/')
    for (let i = 1; i < parts.length; i++) {
      const ancestorPath = parts.slice(0, i).join('/')
      let stateSet = dirStates.get(ancestorPath)
      if (!stateSet) {
        stateSet = new Set()
        dirStates.set(ancestorPath, stateSet)
      }
      stateSet.add(entry.state)
    }
  }

  const result = new Map<string, CompareState>()
  for (const [dirPath, states] of dirStates) {
    for (const p of DIR_STATE_PRIORITY) {
      if (states.has(p)) {
        result.set(dirPath, p)
        break
      }
    }
  }

  return result
}
