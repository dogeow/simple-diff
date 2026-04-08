import type { FileEntry, DiffReason } from '@shared/types'
import type { CompareStrategy } from '../types'

/** Compares modification timestamps. Considers entries equal if within 2s tolerance. */
export class MtimeStrategy implements CompareStrategy {
  readonly name = 'mtime'

  private static readonly TOLERANCE_MS = 2000

  compare(left: FileEntry, right: FileEntry): DiffReason | null {
    const diff = Math.abs(left.mtime - right.mtime)
    if (diff > MtimeStrategy.TOLERANCE_MS) {
      return { type: 'mtime', leftMtime: left.mtime, rightMtime: right.mtime }
    }
    return null
  }
}
