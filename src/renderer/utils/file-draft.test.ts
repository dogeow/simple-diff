// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { diffFixture } from '../test-utils/diff-fixture'
import { useAppStore } from '../stores/app-store'
import { changeFileDraft } from './file-draft'

it('ignores stale computations and lets undo restore the previous draft', async () => {
  const completions: Array<(value: unknown) => void> = []
  window.api = { textDiff: vi.fn(() => new Promise((resolve) => completions.push(resolve))) } as unknown as Window['api']
  const original = diffFixture()
  useAppStore.setState({ diffTabs: [original], compareTabs: [] })
  changeFileDraft(original, { leftContent: 'first', rightContent: 'right' })
  changeFileDraft(useAppStore.getState().diffTabs[0], { leftContent: 'second', rightContent: 'right' })
  const latestResult = { leftLines: [{ type: 'remove', content: 'second', lineNumber: 1 }], rightLines: [] }
  completions[1]({ success: true, data: latestResult })
  await Promise.resolve()
  completions[0]({ success: true, data: { leftLines: [], rightLines: [] } })
  await Promise.resolve()
  expect(useAppStore.getState().diffTabs[0].diffResult).toEqual(latestResult)
  const current = useAppStore.getState().diffTabs[0]
  changeFileDraft(current, current.undoStack!.at(-1)!, 'undo')
  expect(useAppStore.getState().diffTabs[0].leftContent).toBe('first')
  expect(useAppStore.getState().diffTabs[0].redoStack?.at(-1)?.leftContent).toBe('second')
  completions[2]({ success: true, data: { leftLines: [], rightLines: [] } })
  await Promise.resolve()
})
