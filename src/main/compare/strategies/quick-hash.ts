import type { FileEntry, DiffReason } from '@shared/types'
import type { CompareContext, CompareStrategy } from '../types'

const WINDOW_SIZE = 64 * 1024

async function buildQuickSignature(
  size: number,
  filePath: string,
  hashRange: (path: string, start: number, endInclusive: number) => Promise<string>,
): Promise<string> {
  if (size <= 0) return 'empty'

  if (size <= WINDOW_SIZE * 2) {
    return hashRange(filePath, 0, size - 1)
  }

  const headEnd = WINDOW_SIZE - 1
  const tailStart = size - WINDOW_SIZE

  const [head, tail] = await Promise.all([
    hashRange(filePath, 0, headEnd),
    hashRange(filePath, tailStart, size - 1),
  ])

  return `${head}:${tail}`
}

export class QuickHashStrategy implements CompareStrategy {
  readonly name = 'quick_hash'

  async compare(left: FileEntry, right: FileEntry, context: CompareContext): Promise<DiffReason | null> {
    if (left.size !== right.size) {
      return { type: 'quick_hash', leftHash: `size:${left.size}`, rightHash: `size:${right.size}` }
    }

    const [leftHash, rightHash] = await Promise.all([
      buildQuickSignature(left.size, context.leftPath, context.leftSource.hashFileRange.bind(context.leftSource)),
      buildQuickSignature(right.size, context.rightPath, context.rightSource.hashFileRange.bind(context.rightSource)),
    ])

    if (leftHash !== rightHash) {
      return { type: 'quick_hash', leftHash, rightHash }
    }

    return null
  }
}
