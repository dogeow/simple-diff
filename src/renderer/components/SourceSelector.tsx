import { useCallback, useEffect, useRef, useState } from 'react'
import { joinSourcePath, trimTrailingSeparators } from '@shared/source-path'
import { useShallow } from 'zustand/react/shallow'
import type { FileEntry, SSHConfig } from '../../../shared/types'
import { useSSHStore } from '../stores/ssh-store'

interface SourceSelectorProps {
  readonly label: string
  readonly sourceType: 'local' | 'sftp'
  readonly path: string
  readonly sshConfigId: string
  readonly onSourceTypeChange: (type: 'local' | 'sftp') => void
  readonly onPathChange: (path: string) => void
  readonly onSSHConfigIdChange: (id: string) => void
}

function getDroppedFolderPath(event: React.DragEvent<HTMLDivElement>): string | null {
  // Use Electron's webUtils.getPathForFile (works with contextIsolation)
  const files = event.dataTransfer.files
  if (files.length > 0) {
    const filePath = window.api.getPathForFile(files[0])
    if (filePath) return filePath
  }

  const uriList = event.dataTransfer.getData('text/uri-list')
  if (uriList) {
    const uri = uriList
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'))

    if (uri?.startsWith('file://')) {
      try {
        return decodeURIComponent(new URL(uri).pathname)
      } catch {
        // Ignore malformed URI payloads and continue with other fallbacks.
      }
    }
  }

  const plainText = event.dataTransfer.getData('text/plain').trim()
  if (plainText) {
    if (plainText.startsWith('file://')) {
      try {
        return decodeURIComponent(new URL(plainText).pathname)
      } catch {
        return plainText
      }
    }

    return plainText
  }

  return null
}

function normalizeRemoteBrowserPath(path: string): string {
  const trimmed = trimTrailingSeparators(path.trim())
  if (!trimmed) {
    return '/'
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function getRemoteParentPath(path: string): string {
  const normalizedPath = normalizeRemoteBrowserPath(path)
  if (normalizedPath === '/') {
    return '/'
  }

  const segments = normalizedPath.split('/').filter(Boolean)
  if (segments.length <= 1) {
    return '/'
  }

  return `/${segments.slice(0, -1).join('/')}`
}

export default function SourceSelector({
  label,
  sourceType,
  path,
  sshConfigId,
  onSourceTypeChange,
  onPathChange,
  onSSHConfigIdChange,
}: SourceSelectorProps) {
  const { configs, loadConfigs } = useSSHStore(useShallow((state) => ({
    configs: state.configs,
    loadConfigs: state.loadConfigs,
  })))
  const [isDragOver, setIsDragOver] = useState(false)
  const [remoteBrowserOpen, setRemoteBrowserOpen] = useState(false)
  const [remoteBrowserPath, setRemoteBrowserPath] = useState('/')
  const [remoteDirectories, setRemoteDirectories] = useState<readonly FileEntry[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const dragDepthRef = useRef(0)

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  const handleBrowse = async () => {
    const result = await window.api.selectFolder()
    if (result.success && result.data) {
      onPathChange(result.data)
    }
  }

  const loadRemoteDirectories = useCallback(async (nextPath: string) => {
    if (!sshConfigId) {
      return
    }

    setRemoteLoading(true)
    setRemoteError(null)

    const result = await window.api.browseSSH(sshConfigId, nextPath)
    if (result.success && result.data) {
      const directories = result.data
        .filter((entry) => entry.isDirectory)
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
      setRemoteDirectories(directories)
    } else {
      setRemoteDirectories([])
      setRemoteError(result.error ?? '远程目录读取失败')
    }

    setRemoteLoading(false)
  }, [sshConfigId])

  const navigateRemoteDirectory = useCallback((nextPath: string) => {
    const normalizedPath = normalizeRemoteBrowserPath(nextPath)
    setRemoteBrowserPath(normalizedPath)
    void loadRemoteDirectories(normalizedPath)
  }, [loadRemoteDirectories])

  const handleOpenRemoteBrowser = useCallback(() => {
    const configDefaultPath = configs.find((config) => config.id === sshConfigId)?.defaultPath ?? ''
    const initialPath = normalizeRemoteBrowserPath(path || configDefaultPath || '/')
    setRemoteBrowserOpen(true)
    navigateRemoteDirectory(initialPath)
  }, [configs, navigateRemoteDirectory, path, sshConfigId])

  useEffect(() => {
    if (sourceType !== 'sftp') {
      setRemoteBrowserOpen(false)
      setRemoteDirectories([])
      setRemoteError(null)
      setRemoteLoading(false)
      return
    }

    setRemoteBrowserOpen(false)
  }, [sourceType, sshConfigId])

  useEffect(() => {
    if (!remoteBrowserOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRemoteBrowserOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [remoteBrowserOpen])

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (sourceType !== 'local') return
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDragOver(true)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (sourceType !== 'local') return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (sourceType !== 'local') return
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setIsDragOver(false)
    }
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (sourceType !== 'local') return
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDragOver(false)

    const droppedPath = getDroppedFolderPath(event)
    if (droppedPath) {
      onPathChange(droppedPath)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-neutral-400">{label}</label>
      <div
        className={`flex gap-2 rounded-lg transition-colors ${isDragOver ? 'bg-blue-500/10' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <select
          value={sourceType}
          onChange={(e) => onSourceTypeChange(e.target.value as 'local' | 'sftp')}
          className="rounded border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500"
        >
          <option value="local">本地</option>
          <option value="sftp">SFTP</option>
        </select>

        {sourceType === 'sftp' && (
          <select
            value={sshConfigId}
            onChange={(e) => {
              onSSHConfigIdChange(e.target.value)
              const config = configs.find((c: SSHConfig) => c.id === e.target.value)
              if (config?.defaultPath) {
                onPathChange(config.defaultPath)
              }
            }}
            className="rounded border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500"
          >
            <option value="">选择连接...</option>
            {configs.map((c: SSHConfig) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c.host})
              </option>
            ))}
          </select>
        )}

        <input
          type="text"
          value={path}
          onChange={(e) => onPathChange(e.target.value)}
          placeholder={sourceType === 'local' ? '选择或拖入目录路径...' : '远程目录路径...'}
          className={`flex-1 rounded border bg-neutral-800 px-3 py-1.5 text-sm text-neutral-100 placeholder-neutral-500 outline-none ${
            isDragOver
              ? 'border-blue-500 ring-1 ring-blue-500/40'
              : 'border-neutral-600 focus:border-blue-500'
          }`}
        />

        {sourceType === 'local' && (
          <button
            onClick={handleBrowse}
            className="rounded bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600 active:bg-neutral-500"
          >
            浏览...
          </button>
        )}

        {sourceType === 'sftp' && (
          <button
            onClick={handleOpenRemoteBrowser}
            disabled={!sshConfigId}
            className="rounded bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600 active:bg-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            浏览...
          </button>
        )}
      </div>

      {sourceType === 'sftp' && remoteBrowserOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setRemoteBrowserOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${label}远程目录浏览`}
            className="flex max-h-[min(80vh,640px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-850 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-neutral-100">浏览远程目录</div>
                <div className="truncate text-xs text-neutral-400" title={remoteBrowserPath}>
                  {remoteBrowserPath}
                </div>
              </div>
              <button
                onClick={() => setRemoteBrowserOpen(false)}
                className="rounded bg-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-600"
              >
                关闭
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-neutral-700 px-4 py-3">
              <button
                onClick={() => navigateRemoteDirectory(getRemoteParentPath(remoteBrowserPath))}
                disabled={remoteLoading || remoteBrowserPath === '/'}
                className="rounded bg-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                上一级
              </button>
              <button
                onClick={() => void loadRemoteDirectories(remoteBrowserPath)}
                disabled={remoteLoading}
                className="rounded bg-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                刷新
              </button>
              <button
                onClick={() => {
                  onPathChange(remoteBrowserPath)
                  setRemoteBrowserOpen(false)
                }}
                disabled={remoteLoading}
                className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                选择当前目录
              </button>
            </div>

            <div className="flex-1 overflow-auto px-4 py-3">
              {remoteLoading && (
                <div className="rounded border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-400">
                  正在读取远程目录...
                </div>
              )}

              {remoteError && !remoteLoading && (
                <div className="rounded border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-300">
                  {remoteError}
                </div>
              )}

              {!remoteLoading && !remoteError && (
                <div className="overflow-hidden rounded border border-neutral-700 bg-neutral-900/60">
                  {remoteDirectories.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-neutral-500">当前目录下没有可浏览的子目录</div>
                  ) : (
                    remoteDirectories.map((entry) => {
                      const nextPath = joinSourcePath('sftp', remoteBrowserPath, entry.name)

                      return (
                        <button
                          key={entry.path}
                          onClick={() => navigateRemoteDirectory(nextPath)}
                          className="flex w-full items-center justify-between border-b border-neutral-800 px-3 py-2 text-left text-sm text-neutral-200 last:border-b-0 hover:bg-neutral-800"
                        >
                          <span className="truncate">{entry.name}/</span>
                          <span className="text-xs text-neutral-500">进入</span>
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
