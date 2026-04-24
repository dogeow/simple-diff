function normalizePathValue(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, '')
}

const EXACT_PATH_PREFIX = 'path:'

function normalizeFilterRule(filter: string): string {
  const trimmed = filter.trim()
  if (!trimmed) return ''

  if (trimmed.toLowerCase().startsWith(EXACT_PATH_PREFIX)) {
    const exactPath = normalizePathValue(trimmed.slice(EXACT_PATH_PREFIX.length))
    return exactPath ? `${EXACT_PATH_PREFIX}${exactPath}` : ''
  }

  return normalizePathValue(trimmed)
}

function getFilterDedupeKey(filter: string): string {
  return filter.startsWith(EXACT_PATH_PREFIX) ? filter : filter.toLowerCase()
}

export function createExactPathFilter(relativePath: string): string {
  const trimmed = normalizePathValue(relativePath)
  return `${EXACT_PATH_PREFIX}${trimmed}`
}

export function formatPathFilterForDisplay(filter: string): string {
  const normalized = normalizeFilterRule(filter)
  if (!normalized) return ''

  if (normalized.toLowerCase().startsWith(EXACT_PATH_PREFIX)) {
    return normalizePathValue(normalized.slice(EXACT_PATH_PREFIX.length))
  }

  return normalized
}

export function formatPathFiltersForDisplay(filters: readonly string[]): readonly string[] {
  return filters
    .map((filter) => formatPathFilterForDisplay(filter))
    .filter((filter) => filter.length > 0)
}

export function mergeDisplayedPathFilters(
  displayedFilters: readonly string[],
  previousFilters: readonly string[],
): readonly string[] {
  const exactFiltersByDisplay = new Map<string, string>()

  for (const filter of previousFilters) {
    const normalized = normalizeFilterRule(filter)
    if (!normalized.toLowerCase().startsWith(EXACT_PATH_PREFIX)) continue

    exactFiltersByDisplay.set(formatPathFilterForDisplay(normalized), normalized)
  }

  const mergedDisplayedFilters = mergePathFilters(displayedFilters)
  const restoredFilters = mergedDisplayedFilters.map((filter) => {
    return exactFiltersByDisplay.get(formatPathFilterForDisplay(filter)) ?? filter
  })

  return mergePathFilters(restoredFilters)
}

export function mergePathFilters(...filterGroups: ReadonlyArray<readonly string[] | undefined>): readonly string[] {
  const merged: string[] = []
  const seen = new Set<string>()

  for (const filters of filterGroups) {
    for (const filter of filters ?? []) {
      const normalized = normalizeFilterRule(filter)
      if (!normalized) continue

      const dedupeKey = getFilterDedupeKey(normalized)
      if (seen.has(dedupeKey)) continue

      seen.add(dedupeKey)
      merged.push(normalized)
    }
  }

  return merged
}

export function matchesPathFilter(relativePath: string, filters: readonly string[]): boolean {
  const normalizedPath = normalizePathValue(relativePath)
  const lowerPath = normalizedPath.toLowerCase()
  if (!normalizedPath) return false

  const segments = lowerPath.split('/')

  return filters.some((filter) => {
    const normalizedFilter = normalizePathValue(filter)
    const lowerFilter = normalizedFilter.toLowerCase()
    if (!normalizedFilter) return false

    if (lowerFilter.startsWith(EXACT_PATH_PREFIX)) {
      const exactPath = normalizePathValue(normalizedFilter.slice(EXACT_PATH_PREFIX.length))
      if (!exactPath) return false
      return normalizedPath === exactPath || normalizedPath.startsWith(`${exactPath}/`)
    }

    if (lowerFilter.includes('/')) {
      return lowerPath === lowerFilter || lowerPath.startsWith(`${lowerFilter}/`)
    }

    return segments.includes(lowerFilter)
  })
}