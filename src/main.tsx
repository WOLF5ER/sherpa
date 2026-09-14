import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import '@fontsource/oswald/400.css'
import '@fontsource/oswald/500.css'
import '@fontsource/oswald/600.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './styles/app.css'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useUI } from './store/ui'
import { useProfile } from './store/profile'
import { useRaids } from './store/raids'
import { installCrashLog } from './lib/crashlog'

installCrashLog()

// отладка в dev-сервере: window.__sherpa.useUI.getState() и т.п.
if (import.meta.env.DEV) (window as unknown as { __sherpa: unknown }).__sherpa = { useUI, useProfile, useRaids }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>,
)
