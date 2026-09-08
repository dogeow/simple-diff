import { useAppStore } from '../stores/app-store'
import { useEffect } from 'react'
import { confirmUnsavedChanges, getAllDiffTabs, isDiffTabDirty } from '../utils/unsaved-changes'
import { persistActiveCompareTab } from '../utils/compare-session-navigation'

export function useWindowCloseGuard(): void {
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      persistActiveCompareTab()
      if (getAllDiffTabs().some(isDiffTabDirty)) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const unsubscribe = window.api.onWindowCloseRequested?.(async () => {
      const accepted = await confirmUnsavedChanges(getAllDiffTabs())
      if (accepted) {
        for (const tab of getAllDiffTabs().filter(isDiffTabDirty)) {
          useAppStore.getState().updateDiffTabSession(tab.sessionId, { leftContent: tab.originalLeftContent, rightContent: tab.originalRightContent, diffResult: null })
        }
        persistActiveCompareTab()
      }
      return accepted
    })
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      unsubscribe?.()
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [])
}
