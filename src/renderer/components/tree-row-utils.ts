import type { CompareState } from '../../../shared/types'

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatTime(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function rowBg(state: CompareState): string {
  switch (state) {
    case 'different': return 'bg-yellow-900/10'
    case 'left_only': return 'bg-blue-900/10'
    case 'right_only': return 'bg-purple-900/10'
    case 'comparing': return 'bg-blue-900/5'
    default: return ''
  }
}
