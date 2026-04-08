import type { FileEntry, DiffReason } from '@shared/types'
import type { CompareContext, CompareStrategy } from '../types'

export class HashStrategy implements CompareStrategy {
  readonly name = 'hash'

  async compare(left: FileEntry, right: FileEntry, context: CompareContext): Promise<DiffReason | null> {
    if (left.size !== right.size) {
      return { type: 'hash', leftHash: `size:${left.size}`, rightHash: `size:${right.size}` }
    }

    const [leftHash, rightHash] = await Promise.all([
      context.leftSource.hashFile(context.leftPath),
      context.rightSource.hashFile(context.rightPath),
    ])

    if (leftHash !== rightHash) {
      return { type: 'hash', leftHash, rightHash }
    }

    return null
  }
}
