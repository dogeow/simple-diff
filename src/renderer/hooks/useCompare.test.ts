import { describe, expect, it } from 'vitest'
import type { CompareSessionSnapshot } from '../stores/compare-store'
import type { CompareTab } from '../stores/app-store'
import { resolveReusableCompareId } from './useCompare'

function createSnapshot(overrides: Partial<CompareSessionSnapshot> = {}): CompareSessionSnapshot {
  return {
    leftPath: '/left',
    rightPath: '/right',
    leftSourceType: 'local',
    rightSourceType: 'local',
    leftSSHConfigId: '',
    rightSSHConfigId: '',
    strategies: ['size', 'mtime'],
    extensionFilter: [],
    hideDot: true,
    hideDotFilter: 'all',
    entries: [],
    scanning: false,
    comparing: false,
    paused: false,
    done: false,
    error: null,
    duration: 0,
    leftSource: { type: 'local', path: '/left' },
    rightSource: { type: 'local', path: '/right' },
    loadingDirs: [],
    filter: 'all',
    expandedDirs: [],
    viewMode: 'split',
    activeCompareId: null,
    ...overrides,
  }
}

function createCompareTab(snapshot: CompareSessionSnapshot): CompareTab {
  return {
    id: 'compare-tab-1',
    title: 'left ↔ right',
    snapshot,
    diffTabs: [],
    activeDiffTabId: null,
  }
}

describe('resolveReusableCompareId', () => {
  it('prefers the currently active compare store session when it is running', () => {
    expect(resolveReusableCompareId(
      createSnapshot({ activeCompareId: 'compare-live', scanning: true }),
      createCompareTab(createSnapshot({ activeCompareId: 'compare-bg', scanning: true })),
    )).toBe('compare-live')
  })

  it('falls back to the active compare tab snapshot when home page state is idle', () => {
    expect(resolveReusableCompareId(
      createSnapshot({ activeCompareId: null, scanning: false, comparing: false }),
      createCompareTab(createSnapshot({ activeCompareId: 'compare-bg', comparing: true })),
    )).toBe('compare-bg')
  })

  it('returns null when there is no running compare to reuse', () => {
    expect(resolveReusableCompareId(
      createSnapshot({ done: true }),
      createCompareTab(createSnapshot({ activeCompareId: null, done: true })),
    )).toBeNull()
  })
})