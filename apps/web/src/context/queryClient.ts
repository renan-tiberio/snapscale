import { QueryClient } from '@tanstack/react-query'

/**
 * App-wide query client. Retries are off: the API answers with a typed
 * `ApiError` (see `services/http.ts`) and the UI shows it straight away —
 * retrying a 401/422 only delays the message.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000 },
      mutations: { retry: false },
    },
  })
}
