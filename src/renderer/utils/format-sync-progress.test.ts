import { describe, expect, it } from 'vitest'
import { formatSyncProgress } from './format-sync-progress'

describe('formatSyncProgress', () => {
  it('shows whole percentages for totals below one thousand', () => {
    expect(formatSyncProgress(499, 999)).toBe('50%')
  })

  it('shows one decimal place for totals below ten thousand', () => {
    expect(formatSyncProgress(5500, 9500)).toBe('57.9%')
  })

  it('shows two decimal places for totals at ten thousand and above', () => {
    expect(formatSyncProgress(263397, 344476)).toBe('76.46%')
  })

  it('does not round incomplete progress up to one hundred percent', () => {
    expect(formatSyncProgress(998, 999)).toBe('99%')
    expect(formatSyncProgress(9499, 9500)).toBe('99.9%')
  })

  it('falls back to zero when no work items exist yet', () => {
    expect(formatSyncProgress(0, 0)).toBe('0%')
  })
})