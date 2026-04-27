import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { addRendererLog } from './stores/log-store'
import './styles/globals.css'

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
