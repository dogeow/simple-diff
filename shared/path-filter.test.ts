import { describe, expect, it } from 'vitest'
import { createExactPathFilter, matchesPathFilter, mergePathFilters } from './path-filter'

describe('matchesPathFilter', () => {
  it('matches path segments for plain filter values', () => {
    expect(matchesPathFilter('src/generated/schema.ts', ['generated'])).toBe(true)
    expect(matchesPathFilter('src/schema.ts', ['generated'])).toBe(false)
  })

  it('matches exact paths and descendants for exact path rules', () => {
    const rule = createExactPathFilter('config')

    expect(matchesPathFilter('config', [rule])).toBe(true)
    expect(matchesPathFilter('config/app.php', [rule])).toBe(true)
    expect(matchesPathFilter('src/config/app.php', [rule])).toBe(false)
  })

  it('keeps exact path rules case-sensitive', () => {
    expect(matchesPathFilter('Config/app.php', ['path:Config'])).toBe(true)
    expect(matchesPathFilter('config/app.php', ['path:Config'])).toBe(false)
  })

  it('normalizes leading slashes in exact path rules', () => {
    expect(matchesPathFilter('config/app.php', ['path:/config'])).toBe(true)
  })

  it('merges filters with normalization and stable dedupe', () => {
    expect(mergePathFilters(
      [' node_modules ', 'path:/Config', 'dist'],
      ['NODE_MODULES', 'path:/Config', 'path:/config', ''],
    )).toEqual(['node_modules', 'path:Config', 'dist', 'path:config'])
  })
})