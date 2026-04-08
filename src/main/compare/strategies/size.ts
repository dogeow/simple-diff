import type { FileEntry, DiffReason } from '@shared/types'
import type { CompareStrategy } from '../types'

export class SizeStrategy implements CompareStrategy {
  readonly name = 'size'

  compare(left: FileEntry, right: FileEntry): DiffReason | null {
    if (left.size !== right.size) {
      return { type: 'size', leftSize: left.size, rightSize: right.size }
    }
    return null
  }
}
