import type { FileEntry, DiffReason } from '@shared/types'
import type { FileSource } from '../file-source/types'

export interface CompareContext {
  readonly leftSource: FileSource
  readonly rightSource: FileSource
  readonly leftPath: string
  readonly rightPath: string
}

export interface CompareStrategy {
  readonly name: string
  compare(left: FileEntry, right: FileEntry, context: CompareContext): Promise<DiffReason | null>
}
