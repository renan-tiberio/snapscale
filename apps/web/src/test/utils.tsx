import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { AuthProvider } from '@/context/AuthContext'
import { routes } from '@/router'
import { AUTH_STORAGE_KEY } from '@/services/http'

import { TEST_TOKEN, testUser } from './msw/handlers'

import type { SessionResponse } from '@snapscale/shared'
import type { ReactNode } from 'react'

/** Writes a valid session to localStorage so a render starts authenticated. */
export function seedSession(session: SessionResponse = { token: TEST_TOKEN, user: testUser }): void {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

/** Query client for tests: no retries (errors surface immediately), no cache reuse. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

/** Wrapper for `renderHook`: query client + auth provider, no router needed. */
export function createHookWrapper() {
  const queryClient = createTestQueryClient()

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    )
  }
}

/** Mounts the real route tree (App provides the query client + auth context). */
export function renderApp(initialEntries: string[] = ['/']) {
  const router = createMemoryRouter(routes, { initialEntries })

  return render(<RouterProvider router={router} />)
}
