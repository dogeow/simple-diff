export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`

  const durationSeconds = durationMs / 1000
  const formattedSeconds = Number.isInteger(durationSeconds)
    ? String(durationSeconds)
    : durationSeconds.toFixed(1).replace(/\.0$/, '')

  return `${formattedSeconds}s`
}
