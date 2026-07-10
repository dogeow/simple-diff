import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { ensureAppApi } from './runtime/ensure-app-api'
import { addRendererLog } from './stores/log-store'
import { useSettingsStore } from './stores/settings-store'
import { applyTheme, getSystemPrefersDark } from './utils/theme'
import './styles/globals.css'

ensureAppApi()
applyTheme(useSettingsStore.getState().theme, getSystemPrefersDark())

window.addEventListener('error', (event) => {
  addRendererLog('app', 'error', `window.onerror: ${event.message} @ ${event.filename}:${event.lineno}:${event.colno}\n${event.error?.stack ?? ''}`)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const message = reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason)
  addRendererLog('app', 'error', `unhandledrejection: ${message}`)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
