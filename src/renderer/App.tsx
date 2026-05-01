import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ComparePage from './pages/ComparePage'
import TextComparePage from './pages/TextComparePage'
import SSHManagerPage from './pages/SSHManagerPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import { useAppStore } from './stores/app-store'
import { useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { applyDirtyPathsToSnapshot, sanitizePersistedCompareSessionSnapshot, useCompareStore } from './stores/compare-store'
import { bindCompareEvents } from './utils/compare-events'
import { useCompareActions } from './hooks/useCompare'

export default function App() {
  const page = useAppStore((s) => s.page)
  const compareTabs = useAppStore((s) => s.compareTabs)
  const activeCompareTabId = useAppStore((s) => s.activeCompareTabId)
  const setPage = useAppStore((s) => s.setPage)
  const replaceDiffTabs = useAppStore((s) => s.replaceDiffTabs)
  const setActiveCompareTab = useAppStore((s) => s.setActiveCompareTab)
  const setSyncTask = useCompareStore((s) => s.setSyncTask)
  const hydrateSourceInputs = useCompareStore((s) => s.hydrateSourceInputs)
  const { liveLeftSource, liveRightSource, scanning, comparing, entryCount } = useCompareStore(useShallow((s) => ({
    liveLeftSource: s.leftSource,
    liveRightSource: s.rightSource,
    scanning: s.scanning,
    comparing: s.comparing,
    entryCount: s.entries.length,
  })))
  const restoredCompareTabsRef = useRef(false)
  const { runCompare } = useCompareActions()
  const activeCompareTab = useMemo(
    () => activeCompareTabId ? compareTabs.find((tab) => tab.id === activeCompareTabId) ?? null : null,
    [activeCompareTabId, compareTabs],
  )
  const watchTarget = useMemo(() => {
    if (!activeCompareTabId) {
      return null
    }

    if (page === 'compare') {
      return {
        sessionId: activeCompareTabId,
        leftSource: liveLeftSource,
        rightSource: liveRightSource,
        scanning,
        comparing,
        hasEntries: entryCount > 0,
      }
    }

    const snapshot = activeCompareTab?.snapshot
    if (!snapshot) {
      return null
    }

    return {
      sessionId: activeCompareTabId,
      leftSource: snapshot.leftSource,
      rightSource: snapshot.rightSource,
      scanning: snapshot.scanning,
      comparing: snapshot.comparing,
      hasEntries: snapshot.entries.length > 0,
    }
  }, [activeCompareTab, activeCompareTabId, comparing, entryCount, liveLeftSource, liveRightSource, page, scanning])

  useEffect(() => {
    if (restoredCompareTabsRef.current) return
    restoredCompareTabsRef.current = true

    const appState = useAppStore.getState()
    const targetCompareTab = appState.compareTabs.find((tab) => tab.id === appState.activeCompareTabId)
      ?? appState.compareTabs[appState.compareTabs.length - 1]

    if (!targetCompareTab) return

    useCompareStore.getState().restoreSnapshot(
      sanitizePersistedCompareSessionSnapshot(targetCompareTab.snapshot),
    )
    replaceDiffTabs(targetCompareTab.diffTabs, targetCompareTab.activeDiffTabId)
    setActiveCompareTab(targetCompareTab.id)
    setPage('compare')
  }, [replaceDiffTabs, setActiveCompareTab, setPage])

  useEffect(() => {
    void (async () => {
      const response = await window.api.getSyncStatus()
      if (!response.success || !response.data) return
      setSyncTask(response.data)

      const state = useCompareStore.getState()
      if (!state.leftPath && !state.rightPath && !state.leftSource && !state.rightSource) {
        hydrateSourceInputs(response.data.leftSource, response.data.rightSource)
      }
    })()

    const unsubscribe = window.api.onSyncProgress((task) => {
      setSyncTask(task)
    })

    return unsubscribe
  }, [hydrateSourceInputs, setSyncTask])

  useEffect(() => {
    return bindCompareEvents(window.api)
  }, [])

  useEffect(() => {
    if (typeof window.api.onCompareLocalDirty !== 'function') return

    return window.api.onCompareLocalDirty((sessionId, paths) => {
      if (paths.length === 0) {
        return
      }

      useAppStore.getState().updateCompareTabSnapshot(sessionId, (snapshot) =>
        applyDirtyPathsToSnapshot(snapshot, paths),
      )

      const appState = useAppStore.getState()
      if (appState.page === 'compare' && appState.activeCompareTabId === sessionId) {
        useCompareStore.getState().markDirtyPaths(paths)
      }
    })
  }, [])

  useEffect(() => {
    if (!watchTarget?.sessionId) {
      return
    }

    if (!watchTarget.leftSource || !watchTarget.rightSource || watchTarget.scanning || watchTarget.comparing || !watchTarget.hasEntries) {
      void window.api.stopLocalCompareWatch(watchTarget.sessionId)
      return
    }

    void window.api.startLocalCompareWatch({
      sessionId: watchTarget.sessionId,
      left: watchTarget.leftSource,
      right: watchTarget.rightSource,
    })

    return () => {
      void window.api.stopLocalCompareWatch(watchTarget.sessionId)
    }
  }, [watchTarget])

  useEffect(() => {
    if (typeof window.api.onOpenPaths !== 'function') return
    return window.api.onOpenPaths((paths) => {
      if (paths.length === 0) return
      const compareState = useCompareStore.getState()
      compareState.setLeftSourceType('local')
      compareState.setLeftSSHConfigId('')
      compareState.setLeftPath(paths[0])

      if (paths.length >= 2) {
        compareState.setRightSourceType('local')
        compareState.setRightSSHConfigId('')
        compareState.setRightPath(paths[1])
        void runCompare()
      } else {
        setPage('home')
      }
    })
  }, [runCompare, setPage])

  return (
    <Layout>
      {page === 'home' && <HomePage />}
      {page === 'compare' && <ComparePage />}
      {page === 'text' && <TextComparePage />}
      {page === 'ssh' && <SSHManagerPage />}
      {page === 'history' && <HistoryPage />}
      {page === 'settings' && <SettingsPage />}
    </Layout>
  )
}
