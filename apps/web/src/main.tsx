import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import './index.css'
import { router } from './router'
import { startBrowserTelemetry } from './services/telemetry'

// No-op unless VITE_OTEL_ENABLED=true (docs/04 task 10) — see
// services/telemetry.ts for why this is a stub, not the real Web SDK, and
// why call-site ordering doesn't carry the same weight it does in
// apps/api/src/index.ts (there is no module-loader patching to race here).
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
