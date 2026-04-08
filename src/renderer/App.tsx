import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ComparePage from './pages/ComparePage'
import SSHManagerPage from './pages/SSHManagerPage'
import HistoryPage from './pages/HistoryPage'
import { useAppStore } from './stores/app-store'

export default function App() {
  const page = useAppStore((s) => s.page)

  return (
    <Layout>
      {page === 'home' && <HomePage />}
      {page === 'compare' && <ComparePage />}
      {page === 'ssh' && <SSHManagerPage />}
      {page === 'history' && <HistoryPage />}
    </Layout>
  )
}
