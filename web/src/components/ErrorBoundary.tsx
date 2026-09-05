import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '@/i18n'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
  info: string | null
}

/** App-root error boundary. An uncaught render error otherwise unmounts the
 *  whole React tree (blank page) and React's own log is the only trace —
 *  users can't read a devtools console. This keeps the failure on screen with
 *  the message + stack so it can be reported, plus a one-click reload. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ info: errorInfo.componentStack ?? null })
    // Keep the conventional console trace for devtools users.
    console.error('[ErrorBoundary]', error, errorInfo.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    // Class component outside the React-i18next hook world: read the global
    // i18n instance directly (it initializes synchronously from bundled
    // resources, so it is available even when the tree below crashed).
    const t = i18n.t.bind(i18n)
    return (
      <div className="fixed inset-0 z-[99999] overflow-auto bg-background p-6 text-foreground">
        <div className="mx-auto max-w-2xl space-y-3">
          <h1 className="text-lg font-semibold text-destructive">{t('error.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('error.description')}
          </p>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap text-destructive">
            {this.state.error.message}
          </pre>
          {this.state.info && (
            <pre className="max-h-48 overflow-auto rounded-md bg-muted/50 p-3 text-[11px] whitespace-pre-wrap text-muted-foreground">
              {this.state.info}
            </pre>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              {t('error.reload')}
            </button>
            <button
              type="button"
              onClick={() => this.setState({ error: null, info: null })}
              className="rounded-md border px-4 py-2 text-sm"
            >
              {t('error.recover')}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
