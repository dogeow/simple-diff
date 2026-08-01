/** Shared Chrome-only heap summary for heavy-path debug logs. */

function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return '-'
  return `${(value / 1024 / 1024).toFixed(1)}MB`
}

export function formatRendererMemoryUsage(): string {
  const memory = (performance as Performance & {
    readonly memory?: {
      readonly usedJSHeapSize: number
      readonly totalJSHeapSize: number
      readonly jsHeapSizeLimit: number
    }
  }).memory

  if (!memory) {
    return 'heap=n/a'
  }

  return `heap=${formatBytes(memory.usedJSHeapSize)}/${formatBytes(memory.totalJSHeapSize)} limit=${formatBytes(memory.jsHeapSizeLimit)}`
}
