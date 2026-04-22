import { describe, expect, it } from 'vitest'
import { shouldShowDirectorySpinner } from './tree-row-utils'

describe('shouldShowDirectorySpinner', () => {
  it('shows a spinner when a directory is lazily loading', () => {
    expect(shouldShowDirectorySpinner(true, true, 'equal')).toBe(true)
  })

  it('shows a spinner when a directory is actively comparing', () => {
    expect(shouldShowDirectorySpinner(true, false, 'comparing')).toBe(true)
  })

  it('does not show a spinner for non-directory compare states', () => {
    expect(shouldShowDirectorySpinner(true, false, 'equal')).toBe(false)
    expect(shouldShowDirectorySpinner(false, false, 'comparing')).toBe(false)
  })
})