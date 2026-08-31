import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import './index.css'
import { router } from './router'
import { startBrowserTelemetry } from './services/telemetry'

// No-op unless VITE_OTEL_ENABLED=true — see services/telemetry for why.
startBrowserTelemetry()

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element (#root) not found — check index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
