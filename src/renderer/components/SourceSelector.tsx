import { useEffect, useRef, useState } from 'react'
import type { SSHConfig } from '../../../shared/types'
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

export default function SourceSelector({
  label,
  sourceType,
  path,
  sshConfigId,
  onSourceTypeChange,
  onPathChange,
  onSSHConfigIdChange,
}: SourceSelectorProps) {
  const { configs, loadConfigs } = useSSHStore()
  const [isDragOver, setIsDragOver] = useState(false)
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
      </div>
    </div>
  )
}
