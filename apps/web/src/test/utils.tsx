import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter, useRoutes } from 'react-router'

import { TEST_TOKEN, testUser } from './msw/handlers'

import type { SessionResponse } from '@snapscale/shared'
import type { ReactNode } from 'react'

import { AuthProvider } from '@/context/AuthContext'
import { routes } from '@/router'
import { AUTH_STORAGE_KEY } from '@/services/http'



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

function AppRoutes() {
  return useRoutes(routes)
}

/**
 * Mounts the real route tree (App provides the query client + auth context).
 *
 * `MemoryRouter` + `useRoutes` rather than `createMemoryRouter`: the data
 * router builds a `Request` for every navigation, and under jsdom that request
 * is constructed with jsdom's `AbortSignal` while `Request` comes from Node —
 * the brand check fails and the navigation never lands. The route objects are
 * the very same ones `router.tsx` ships to the browser.
 */
export function renderApp(initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AppRoutes />
    </MemoryRouter>,
  )
}
