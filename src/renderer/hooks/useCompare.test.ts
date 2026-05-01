import { describe, expect, it } from 'vitest'
import type { CompareSessionSnapshot } from '../stores/compare-store'
import type { CompareTab } from '../stores/app-store'
import { createRunningCompareTabSnapshot, formatCompareErrorForUi, resolveReusableCompareId } from './useCompare'

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

describe('createRunningCompareTabSnapshot', () => {
  it('drops live entries for an active running compare tab snapshot', () => {
    expect(createRunningCompareTabSnapshot(createSnapshot({
      activeCompareId: 'compare-1',
      scanning: true,
      entries: [{
        relativePath: 'docs',
        name: 'docs',
        isDirectory: true,
        state: 'pending',
        left: null,
        right: null,
        reasons: [],
      }],
      loadingDirs: ['docs'],
    }))).toEqual(createSnapshot({
      activeCompareId: 'compare-1',
      scanning: true,
      entries: [],
      loadingDirs: [],
    }))
  })

  it('keeps finished snapshots intact', () => {
    const snapshot = createSnapshot({
      done: true,
      activeCompareId: null,
      entries: [{
        relativePath: 'docs',
        name: 'docs',
        isDirectory: true,
        state: 'equal',
        left: null,
        right: null,
        reasons: [],
      }],
    })

    expect(createRunningCompareTabSnapshot(snapshot)).toEqual(snapshot)
  })
})

describe('formatCompareErrorForUi', () => {
  it('returns a friendly disk-not-mounted message for directory ENOENT errors', () => {
    expect(
      formatCompareErrorForUi("[left] 无法列出目录 .: ENOENT: no such file or directory, scandir '/Volumes/未命名2/迅雷下载/书籍'"),
    ).toBe('左侧目录不可访问：/Volumes/未命名2/迅雷下载/书籍。可能是硬盘未插入、未挂载，或路径已变更。')
  })

  it('keeps non-ENOENT errors unchanged', () => {
    expect(formatCompareErrorForUi('[left] 无法列出目录 .: EACCES: permission denied')).toBe(
      '[left] 无法列出目录 .: EACCES: permission denied',
    )
  })
})