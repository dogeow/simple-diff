import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ComparePage from './pages/ComparePage'
import TextComparePage from './pages/TextComparePage'
import SSHManagerPage from './pages/SSHManagerPage'
import HistoryPage from './pages/HistoryPage'
import { useAppStore } from './stores/app-store'
import { useEffect } from 'react'
import { useCompareStore } from './stores/compare-store'

export default function App() {
  const page = useAppStore((s) => s.page)
  const setPage = useAppStore((s) => s.setPage)
  const setSyncTask = useCompareStore((s) => s.setSyncTask)
  const setSources = useCompareStore((s) => s.setSources)

  useEffect(() => {
    void (async () => {
      const response = await window.api.getSyncStatus()
      if (!response.success || !response.data) return
      setSyncTask(response.data)
      setSources(response.data.leftSource, response.data.rightSource)
      setPage('compare')
    })()

    const unsubscribe = window.api.onSyncProgress((task) => {
      setSyncTask(task)
      if (task) {
        setSources(task.leftSource, task.rightSource)
      }
    })

    return unsubscribe
  }, [setPage, setSources, setSyncTask])

  return (
    <Layout>
      {page === 'home' && <HomePage />}
      {page === 'compare' && <ComparePage />}
      {page === 'text' && <TextComparePage />}
      {page === 'ssh' && <SSHManagerPage />}
      {page === 'history' && <HistoryPage />}
    </Layout>
  )
}
