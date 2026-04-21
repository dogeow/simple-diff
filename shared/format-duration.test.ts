import { describe, expect, it } from 'vitest'
import { formatDuration } from './format-duration'

describe('formatDuration', () => {
  it('keeps millisecond display below one second', () => {
    expect(formatDuration(999)).toBe('999ms')
  })

  it('switches to seconds at one second and above', () => {
    expect(formatDuration(1000)).toBe('1s')
    expect(formatDuration(91033)).toBe('91s')
  })

  it('shows a single decimal place when needed', () => {
    expect(formatDuration(1500)).toBe('1.5s')
    expect(formatDuration(1050)).toBe('1.1s')
  })
})
