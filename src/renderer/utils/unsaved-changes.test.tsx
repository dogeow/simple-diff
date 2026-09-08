// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { diffFixture } from '../test-utils/diff-fixture'
import { createPersistedAppState, useAppStore } from '../stores/app-store'
import { useCompareStore } from '../stores/compare-store'
import { useUIStore } from '../stores/ui-store'
import { confirmUnsavedChanges } from './unsaved-changes'
import { openCompareTab } from './compare-session-navigation'
import UnsavedChangesDialog from '../components/overlays/UnsavedChangesDialog'
import ComparePage from '../pages/ComparePage'

beforeEach(() => {
  useAppStore.setState({ diffTabs: [], compareTabs: [], activeCompareTabId: null, activeDiffTabId: null })
  useUIStore.setState({ pendingUnsavedChanges: null, pendingDiffTabClose: null, overlay: null })
  window.api = { writeText: vi.fn().mockResolvedValue({ success: true }) } as unknown as Window['api']
})
afterEach(cleanup)

it('cancel keeps the document and rejects the destructive continuation', async () => {
  const tab = diffFixture({ rightContent: 'edited' })
  useAppStore.setState({ diffTabs: [tab] })
  const answer = confirmUnsavedChanges()
  render(<UnsavedChangesDialog />)
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(await answer).toBe(false)
  expect(useAppStore.getState().diffTabs[0]).toBe(tab)
})

it('failed save keeps the dialog open and never continues', async () => {
  useAppStore.setState({ diffTabs: [diffFixture({ rightContent: 'edited' })] })
  const writeText = vi.fn().mockResolvedValue({ success: false, error: 'disk full' })
  window.api.writeText = writeText
  const continued = vi.fn()
  void confirmUnsavedChanges().then(continued)
  render(<UnsavedChangesDialog />)
  fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
  expect(continued).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(useAppStore.getState().diffTabs[0].originalRightContent).toBe('right')
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
})

it('switching sessions and persisting retains every dirty draft and its original content', () => {
  const dirty = diffFixture({ rightContent: 'edited' })
  const clean = diffFixture({ id: 'clean', sessionId: 'clean' })
  useCompareStore.setState({ done: true, leftSource: dirty.leftSource, rightSource: dirty.rightSource })
  const snapshot = useCompareStore.getState().createTabSnapshot()
  useAppStore.setState({ activeCompareTabId: 'a', diffTabs: [dirty, clean], activeDiffTabId: clean.id,
    compareTabs: [{ id: 'a', title: 'A', snapshot: { ...snapshot, done: true }, diffTabs: [], activeDiffTabId: null },
      { id: 'b', title: 'B', snapshot, diffTabs: [], activeDiffTabId: null }] })
  openCompareTab('b')
  expect(useAppStore.getState().compareTabs[0].diffTabs[0].rightContent).toBe('edited')
  const persisted = createPersistedAppState(useAppStore.getState())
  expect(persisted.compareTabs[0].diffTabs[0].rightContent).toBe('edited')
  expect(persisted.compareTabs[0].diffTabs[0].originalRightContent).toBe('right')
  expect(persisted.compareTabs[0].diffTabs[1].rightContent).toBe('')
})

it('closing a compare session with an edited file waits for confirmation', async () => {
  const dirty = diffFixture({ rightContent: 'edited' })
  useCompareStore.setState({ leftSource: dirty.leftSource, rightSource: dirty.rightSource, done: true })
  const snapshot = useCompareStore.getState().createTabSnapshot()
  useAppStore.setState({ activeCompareTabId: 'a', diffTabs: [dirty], activeDiffTabId: dirty.id,
    compareTabs: [{ id: 'a', title: 'A', snapshot, diffTabs: [], activeDiffTabId: null }] })
  render(<><ComparePage /><UnsavedChangesDialog /></>)
  fireEvent.click(screen.getByRole('button', { name: '关闭 A' }))
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(useAppStore.getState().compareTabs).toHaveLength(1)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '取消' })) })
  expect(useAppStore.getState().diffTabs[0].rightContent).toBe('edited')
})

it('saving a background session updates only that document instance', async () => {
  const background = diffFixture({ sessionId: 'background', rightContent: 'edited' })
  const foreground = diffFixture({ sessionId: 'foreground' })
  useAppStore.setState({ activeCompareTabId: 'b', diffTabs: [foreground], compareTabs: [
    { id: 'a', title: 'A', snapshot: useCompareStore.getState().createTabSnapshot(), diffTabs: [background], activeDiffTabId: background.id },
  ] })
  const answer = confirmUnsavedChanges([background])
  render(<UnsavedChangesDialog />)
  fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))
  expect(await answer).toBe(true)
  expect(useAppStore.getState().compareTabs[0].diffTabs[0].originalRightContent).toBe('edited')
  expect(useAppStore.getState().diffTabs[0].originalRightContent).toBe('right')
})
