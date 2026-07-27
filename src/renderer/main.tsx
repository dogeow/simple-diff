import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { ensureAppApi } from './runtime/ensure-app-api'
import { addRendererLog } from './stores/log-store'
import { useSettingsStore } from './stores/settings-store'
import { applyTheme, getSystemPrefersDark } from './utils/theme'
import './styles/globals.css'

applyTheme(useSettingsStore.getState().theme, getSystemPrefersDark())

window.addEventListener('error', (event) => {
  addRendererLog('app', 'error', `window.onerror: ${event.message} @ ${event.filename}:${event.lineno}:${event.colno}\n${event.error?.stack ?? ''}`)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const message = reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason)
  addRendererLog('app', 'error', `unhandledrejection: ${message}`)
})

// window.api 必须在 React 挂载前就位：App 的首个 effect 就会调用它
async function bootstrap(): Promise<void> {
  await ensureAppApi()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  )
}

bootstrap().catch((error: unknown) => {
  // 挂载前失败意味着白屏，日志面板也渲染不出来，只能走控制台
  console.error('[main] 启动失败', error)
})
