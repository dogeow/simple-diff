import { Component, type ErrorInfo, type ReactNode } from 'react'
import { addRendererLog } from '../stores/log-store'

interface Props {
  readonly children: ReactNode
}

interface State {
  readonly error: Error | null
  readonly info: ErrorInfo | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ error, info })
    addRendererLog('app', 'error', `渲染崩溃: ${error.message}\n${error.stack ?? ''}\n${info.componentStack ?? ''}`)
    // Also surface to DevTools console
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-canvas p-6 font-mono text-fg">
          <h2 className="text-lg font-semibold text-danger-text">渲染发生异常</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{this.state.error.message}</pre>
          {this.state.error.stack && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer' }}>堆栈</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{this.state.error.stack}</pre>
            </details>
          )}
          {this.state.info?.componentStack && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer' }}>组件栈</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{this.state.info.componentStack}</pre>
            </details>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}
          >
            重新加载窗口
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
