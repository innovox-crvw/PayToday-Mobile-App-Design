import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { CssBaseline, ThemeProvider } from '@mui/material'
import './index.css'
import App from './App.tsx'
import { applyStoredAppPreferences } from './lib/appPreferences'
import { storeTheme } from './theme/storeTheme'

applyStoredAppPreferences()

type RootBoundaryState = { error: Error | null }

class RootErrorBoundary extends Component<{ children: ReactNode }, RootBoundaryState> {
  state: RootBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RootBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, maxWidth: 640, margin: '48px auto', fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: '1.25rem' }}>The app hit an error while rendering</h1>
          <p style={{ color: '#444', lineHeight: 1.5 }}>
            Open the browser developer console (F12) for the full stack trace. If you opened an old bookmark (e.g. port
            5173) while Vite moved to another port, use the <strong>Local</strong> URL from the terminal where{' '}
            <code>npm run dev</code> is running.
          </p>
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              background: '#f5f5f5',
              borderRadius: 8,
              overflow: 'auto',
              fontSize: 13,
            }}
          >
            {this.state.error.message}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Missing #root in index.html')
}

createRoot(rootEl).render(
  <StrictMode>
    <RootErrorBoundary>
      <ThemeProvider theme={storeTheme}>
        <CssBaseline />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </RootErrorBoundary>
  </StrictMode>,
)
