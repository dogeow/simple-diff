import type { FileEntry, DiffReason } from '@shared/types'

export interface CompareStrategy {
  readonly name: string
  compare(left: FileEntry, right: FileEntry): DiffReason | null
}
