import { mergePathFilters } from '@shared/path-filter'

function normalizeFilters(filters: readonly string[]): readonly string[] {
  return mergePathFilters(filters)
}

export function isFilterAdditionOnly(
  previousFilters: readonly string[],
  nextFilters: readonly string[],
): boolean {
  const previous = normalizeFilters(previousFilters)
  const next = normalizeFilters(nextFilters)
  const nextSet = new Set(next)

  if (next.length < previous.length) {
    return false
  }

  return previous.every((filter) => nextSet.has(filter))
}