import type { FileEntry, SourceConfig } from '../../../shared/types'

const BROWSER_SOURCE_PREFIX = 'webfs://'

export interface BrowserRootAccessor {
  list: (relativePath: string) => Promise<readonly FileEntry[]>
  readFile: (relativePath: string) => Promise<File>
  readText: (relativePath: string) => Promise<string>
  writeText: (relativePath: string, content: string) => Promise<void>
}

export interface BrowserRegisteredRoot {
  readonly sourcePath: string
  readonly label: string
  readonly accessor: BrowserRootAccessor
  readonly writable: boolean
}

interface BrowserFileDefinition {
  readonly text: string
  readonly mtime?: number
}

interface DataTransferItemWithFileSystemHandle extends DataTransferItem {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>
}

const registeredRoots = new Map<string, BrowserRegisteredRoot>()

function createRootId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return Math.random().toString(36).slice(2)
}

function toSourcePath(label: string): string {
  return `${BROWSER_SOURCE_PREFIX}${createRootId()}/${encodeURIComponent(label || 'folder')}`
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .join('/')
}

function splitRelativePath(relativePath: string): readonly string[] {
  const normalized = normalizeRelativePath(relativePath)
  return normalized ? normalized.split('/') : []
}

function joinRelativePath(parentRelativePath: string, name: string): string {
  const normalizedName = normalizeRelativePath(name)
  if (!parentRelativePath) {
    return normalizedName
  }

  return normalizedName ? `${parentRelativePath}/${normalizedName}` : parentRelativePath
}

function decodeLabel(encodedLabel: string): string {
  try {
    return decodeURIComponent(encodedLabel)
  } catch {
    return encodedLabel
  }
}

function createReadOnlyError(): Error {
  return new Error('当前浏览器目录为只读来源，请重新通过目录选择器授权后再保存')
}

function ensureDirectoryHandle(handle: FileSystemHandle | undefined, relativePath: string): FileSystemDirectoryHandle {
  if (handle?.kind !== 'directory') {
    throw new Error(`目录不存在：${relativePath || '.'}`)
  }

  return handle
}

function ensureFileHandle(handle: FileSystemHandle | undefined, relativePath: string): FileSystemFileHandle {
  if (handle?.kind !== 'file') {
    throw new Error(`文件不存在：${relativePath}`)
  }

  return handle
}

async function getDirectoryHandleAtRelativePath(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<FileSystemDirectoryHandle> {
  let currentHandle = rootHandle

  for (const segment of splitRelativePath(relativePath)) {
    currentHandle = ensureDirectoryHandle(await currentHandle.getDirectoryHandle(segment), relativePath)
  }

  return currentHandle
}

async function getFileHandleAtRelativePath(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<FileSystemFileHandle> {
  const segments = splitRelativePath(relativePath)
  const fileName = segments.pop()
  if (!fileName) {
    throw new Error('文件路径不能为空')
  }

  const directoryHandle = await getDirectoryHandleAtRelativePath(rootHandle, segments.join('/'))
  return ensureFileHandle(await directoryHandle.getFileHandle(fileName), relativePath)
}

function createHandleAccessor(rootHandle: FileSystemDirectoryHandle): BrowserRootAccessor {
  return {
    list: async (relativePath) => {
      const directoryHandle = await getDirectoryHandleAtRelativePath(rootHandle, relativePath)
      const entries: FileEntry[] = []

      for await (const [name, handle] of directoryHandle.entries()) {
        if (handle.kind === 'directory') {
          entries.push({
            name,
            path: name,
            isDirectory: true,
            size: 0,
            mtime: 0,
          })
          continue
        }

        const file = await handle.getFile()
        entries.push({
          name,
          path: name,
          isDirectory: false,
          size: file.size,
          mtime: file.lastModified,
        })
      }

      return entries
    },

    readFile: async (relativePath) => {
      const fileHandle = await getFileHandleAtRelativePath(rootHandle, relativePath)
      return fileHandle.getFile()
    },

    readText: async (relativePath) => {
      const fileHandle = await getFileHandleAtRelativePath(rootHandle, relativePath)
      const file = await fileHandle.getFile()
      return file.text()
    },

    writeText: async (relativePath, content) => {
      const fileHandle = await getFileHandleAtRelativePath(rootHandle, relativePath)
      if (typeof fileHandle.createWritable !== 'function') {
        throw createReadOnlyError()
      }

      const writable = await fileHandle.createWritable()
      await writable.write(content)
      await writable.close()
    },
  }
}

function registerBrowserRoot(label: string, accessor: BrowserRootAccessor, writable: boolean): string {
  const sourcePath = toSourcePath(label)
  registeredRoots.set(sourcePath, {
    sourcePath,
    label,
    accessor,
    writable,
  })
  return sourcePath
}

export function isBrowserSourcePath(path: string): boolean {
  return path.startsWith(BROWSER_SOURCE_PREFIX)
}

export function formatBrowserSourceLabel(path: string): string | null {
  if (!isBrowserSourcePath(path)) {
    return null
  }

  const encodedLabel = path.slice(BROWSER_SOURCE_PREFIX.length).split('/')[1]
  return encodedLabel ? decodeLabel(encodedLabel) : '浏览器目录'
}

export function formatSourceInputValue(path: string): string {
  return formatBrowserSourceLabel(path) ?? path
}

export function resolveBrowserRoot(source: SourceConfig): BrowserRegisteredRoot | null {
  if (source.type !== 'local' || !isBrowserSourcePath(source.path)) {
    return null
  }

  return registeredRoots.get(source.path) ?? null
}

export function resolveBrowserRelativePath(sourcePath: string, fullPath: string): string {
  if (fullPath === sourcePath) {
    return ''
  }

  if (!fullPath.startsWith(`${sourcePath}/`)) {
    throw new Error('浏览器目录句柄已失效，请重新选择目录')
  }

  return normalizeRelativePath(fullPath.slice(sourcePath.length + 1))
}

export async function pickBrowserDirectory(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof window.showDirectoryPicker !== 'function') {
    return null
  }

  const handle = await window.showDirectoryPicker()
  return registerBrowserRoot(handle.name, createHandleAccessor(handle), true)
}

export async function registerDroppedBrowserDirectory(dataTransfer: DataTransfer): Promise<string | null> {
  const items = Array.from(dataTransfer.items)

  for (const item of items) {
    const handle = await (item as DataTransferItemWithFileSystemHandle).getAsFileSystemHandle?.()
    if (handle?.kind === 'directory') {
      const directoryHandle = handle as FileSystemDirectoryHandle
      return registerBrowserRoot(directoryHandle.name, createHandleAccessor(directoryHandle), true)
    }
  }

  return null
}

export function getBrowserRuntimeCapabilities(): {
  readonly supportsNativeFolderSelection: boolean
  readonly supportsDirectoryDragDrop: boolean
  readonly supportsWriteBack: boolean
} {
  const supportsNativeFolderSelection = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
  const supportsDirectoryDragDrop = typeof DataTransferItem !== 'undefined'
    && typeof (DataTransferItem.prototype as DataTransferItemWithFileSystemHandle).getAsFileSystemHandle === 'function'
  const supportsWriteBack = typeof FileSystemFileHandle !== 'undefined'
    && typeof FileSystemFileHandle.prototype.createWritable === 'function'

  return {
    supportsNativeFolderSelection,
    supportsDirectoryDragDrop,
    supportsWriteBack,
  }
}

export function createMemoryBrowserRoot(label: string, files: Readonly<Record<string, BrowserFileDefinition>>): BrowserRegisteredRoot {
  const normalizedFiles = new Map<string, BrowserFileDefinition>()
  for (const [relativePath, definition] of Object.entries(files)) {
    normalizedFiles.set(normalizeRelativePath(relativePath), definition)
  }

  const accessor: BrowserRootAccessor = {
    list: async (relativePath) => {
      const normalizedParent = normalizeRelativePath(relativePath)
      const childMap = new Map<string, FileEntry>()

      for (const [filePath, definition] of normalizedFiles) {
        const isDirectChild = normalizedParent
          ? filePath.startsWith(`${normalizedParent}/`)
          : true
        if (!isDirectChild) {
          continue
        }

        const remainder = normalizedParent
          ? filePath.slice(normalizedParent.length + 1)
          : filePath
        if (!remainder) {
          continue
        }

        const [segment, ...rest] = remainder.split('/')
        if (rest.length === 0) {
          const file = new File([definition.text], segment, { type: 'text/plain', lastModified: definition.mtime ?? 0 })
          childMap.set(segment, {
            name: segment,
            path: segment,
            isDirectory: false,
            size: file.size,
            mtime: file.lastModified,
          })
          continue
        }

        if (!childMap.has(segment)) {
          childMap.set(segment, {
            name: segment,
            path: segment,
            isDirectory: true,
            size: 0,
            mtime: 0,
          })
        }
      }

      return Array.from(childMap.values())
    },

    readFile: async (relativePath) => {
      const normalizedPath = normalizeRelativePath(relativePath)
      const definition = normalizedFiles.get(normalizedPath)
      if (!definition) {
        throw new Error(`文件不存在：${normalizedPath}`)
      }

      return new File([definition.text], normalizedPath.split('/').at(-1) ?? normalizedPath, {
        type: 'text/plain',
        lastModified: definition.mtime ?? 0,
      })
    },

    readText: async (relativePath) => {
      const normalizedPath = normalizeRelativePath(relativePath)
      const definition = normalizedFiles.get(normalizedPath)
      if (!definition) {
        throw new Error(`文件不存在：${normalizedPath}`)
      }

      return definition.text
    },

    writeText: async (relativePath, content) => {
      const normalizedPath = normalizeRelativePath(relativePath)
      if (!normalizedFiles.has(normalizedPath)) {
        throw new Error(`文件不存在：${normalizedPath}`)
      }

      normalizedFiles.set(normalizedPath, {
        text: content,
        mtime: Date.now(),
      })
    },
  }

  return {
    sourcePath: toSourcePath(label),
    label,
    accessor,
    writable: true,
  }
}