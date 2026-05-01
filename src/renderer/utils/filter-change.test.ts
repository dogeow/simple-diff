import { describe, expect, it } from 'vitest'
import { isFilterAdditionOnly } from './filter-change'

describe('filter-change', () => {
  it('returns true when filters are only added', () => {
    expect(isFilterAdditionOnly(['node_modules'], ['node_modules', 'path:public/cloud'])).toBe(true)
  })

  it('returns false when filters are removed', () => {
    expect(isFilterAdditionOnly(['node_modules', 'path:public/cloud'], ['node_modules'])).toBe(false)
  })
})