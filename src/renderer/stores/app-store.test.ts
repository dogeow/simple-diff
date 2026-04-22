import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore, type DiffTab } from './app-store'

function createDiffTab(overrides: Partial<DiffTab> = {}): DiffTab {
  return {
    id: 'src/file.txt',
    sessionId: 'session-1',
    relativePath: 'src/file.txt',
    fileName: 'file.txt',
    leftSource: { type: 'local', path: '/left' },
    rightSource: { type: 'local', path: '/right' },
    leftFullPath: '/left/src/file.txt',
    rightFullPath: '/right/src/file.txt',
    leftContent: '',
    rightContent: '',
    originalLeftContent: '',
    originalRightContent: '',
    diffResult: null,
    loading: true,
    ...overrides,
  }
}

function resetAppStore(): void {
  useAppStore.setState({
    page: 'home',
    diffTabs: [],
    activeDiffTabId: null,
  })
}

describe('app-store', () => {
  beforeEach(() => {
    resetAppStore()
  })

  it('tracks tab sessions so stale async work can be ignored after reopen', () => {
    const store = useAppStore.getState()

    store.addDiffTab(createDiffTab({ id: 'shared/file.txt', sessionId: 'session-old' }))
    expect(store.hasDiffTabSession('shared/file.txt', 'session-old')).toBe(true)

    store.closeDiffTab('shared/file.txt')
    expect(useAppStore.getState().hasDiffTabSession('shared/file.txt', 'session-old')).toBe(false)

    store.addDiffTab(createDiffTab({ id: 'shared/file.txt', sessionId: 'session-new' }))

    const currentState = useAppStore.getState()
    expect(currentState.hasDiffTabSession('shared/file.txt', 'session-old')).toBe(false)
    expect(currentState.hasDiffTabSession('shared/file.txt', 'session-new')).toBe(true)
  })

  it('keeps a single tab instance when reopening an already-open file', () => {
    const store = useAppStore.getState()

    store.addDiffTab(createDiffTab({ id: 'shared/file.txt', sessionId: 'session-1' }))
    store.addDiffTab(createDiffTab({ id: 'shared/file.txt', sessionId: 'session-2' }))

    const currentState = useAppStore.getState()
    expect(currentState.diffTabs).toHaveLength(1)
    expect(currentState.diffTabs[0]?.sessionId).toBe('session-1')
    expect(currentState.activeDiffTabId).toBe('shared/file.txt')
  })
})
