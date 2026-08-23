import '@testing-library/jest-dom/vitest'

import { afterAll, afterEach, beforeAll } from 'vitest'

import { resetApiState } from './msw/handlers'
import { server } from './msw/server'

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  server.resetHandlers()
  resetApiState()
  window.localStorage.clear()
})

afterAll(() => {
  server.close()
})
