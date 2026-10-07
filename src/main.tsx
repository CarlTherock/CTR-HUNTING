import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { useInstallStore } from '@/features/install/state/installStore'
import '@/index.css'

// The browser can fire `beforeinstallprompt` before any screen is mounted:
// start listening right away so the event is not missed.
useInstallStore.getState().listen()

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
