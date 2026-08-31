import { QueryClient } from '@tanstack/react-query'

const QUERY_STALE_TIME_MS = 30_000 // 30 seconds

/**
 * App-wide query client. Retries are off: the API answers with a typed
 * `ApiError` (see `services/http`) and the UI shows it straight away —
 * retrying a 401/422 only delays the message.
 */
export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: QUERY_STALE_TIME_MS },
      mutations: { retry: false },
    },
  })
