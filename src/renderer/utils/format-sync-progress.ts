function progressDigits(totalItems: number): number {
  if (totalItems >= 10000) return 2
  if (totalItems >= 1000) return 1
  return 0
}

export function formatSyncProgress(completedItems: number, totalItems: number): string {
  if (totalItems <= 0) return '0%'

  const digits = progressDigits(totalItems)
  const ratio = Math.min(Math.max(completedItems / totalItems, 0), 1)

  if (ratio >= 1) {
    return `${(100).toFixed(digits)}%`
  }

  const roundedPercentage = (ratio * 100).toFixed(digits)
  if (Number(roundedPercentage) < 100) {
    return `${roundedPercentage}%`
  }

  const step = 1 / (10 ** digits)
  return `${(100 - step).toFixed(digits)}%`
}