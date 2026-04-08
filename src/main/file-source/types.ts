import type { FileEntry } from '@shared/types'

export interface FileSource {
  readonly type: 'local' | 'sftp'

  /** List immediate children of a directory */
  list(dirPath: string): Promise<readonly FileEntry[]>

  /** Get metadata for a single path */
  stat(filePath: string): Promise<FileEntry>

  /** Recursively list all entries under a directory */
  readDir(dirPath: string): Promise<readonly FileEntry[]>

  /** Check if a path exists */
  exists(path: string): Promise<boolean>

  /** Read file content as UTF-8 text */
  readText(filePath: string): Promise<string>

  /** Compute a stable content hash for a file */
  hashFile(filePath: string): Promise<string>

  /** Write UTF-8 text to a file */
  writeText(filePath: string, content: string): Promise<void>

  /** Release underlying resources (e.g. SSH connection) */
  dispose(): Promise<void>
}
