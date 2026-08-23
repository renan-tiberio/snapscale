import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import './index.css'
import { router } from './router'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element (#root) not found — check index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
