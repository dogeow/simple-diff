import { useAppStore, type DiffTab } from '../stores/app-store'
import { getAllDiffTabs } from './unsaved-changes'

const controllers = new Map<string, AbortController>()
type Contents = Pick<DiffTab, 'leftContent' | 'rightContent'>

function boundedHistory(history: readonly Contents[]): readonly Contents[] {
  let characters = 0
  const kept: Contents[] = []
  for (const entry of [...history].reverse()) {
    characters += entry.leftContent.length + entry.rightContent.length
    if (characters > 4_000_000 || kept.length >= 20) break
    kept.push(entry)
  }
  return kept.reverse()
}

export async function recomputeFileDraft(tab: DiffTab): Promise<void> {
  controllers.get(tab.sessionId)?.abort()
  const controller = new AbortController()
  controllers.set(tab.sessionId, controller)
  useAppStore.getState().updateDiffTabSession(tab.sessionId, { computing: true, loadError: null })
  try {
    const result = await window.api.textDiff(tab.leftContent, tab.rightContent, controller.signal)
    const current = getAllDiffTabs().find((item) => item.sessionId === tab.sessionId)
    if (controller.signal.aborted || !current || current.leftContent !== tab.leftContent || current.rightContent !== tab.rightContent) return
    useAppStore.getState().updateDiffTabSession(tab.sessionId, {
      computing: false, diffResult: result.success ? result.data ?? null : null,
      loadError: result.success ? null : result.error ?? '差异计算失败',
    })
  } catch (error) {
    if (!controller.signal.aborted) useAppStore.getState().updateDiffTabSession(tab.sessionId, {
      computing: false, loadError: error instanceof Error ? error.message : String(error),
    })
  } finally {
    if (controllers.get(tab.sessionId) === controller) controllers.delete(tab.sessionId)
  }
}

export function changeFileDraft(tab: DiffTab, contents: Contents, historyAction: 'edit' | 'undo' | 'redo' = 'edit'): void {
  const previous = { leftContent: tab.leftContent, rightContent: tab.rightContent }
  const next = {
    ...tab, ...contents,
    undoStack: historyAction === 'undo' ? tab.undoStack?.slice(0, -1) : boundedHistory([...(tab.undoStack ?? []), previous]),
    redoStack: historyAction === 'undo' ? boundedHistory([...(tab.redoStack ?? []), previous])
      : historyAction === 'redo' ? tab.redoStack?.slice(0, -1) : [],
  }
  useAppStore.getState().updateDiffTabSession(tab.sessionId, next)
  void recomputeFileDraft(next)
}
