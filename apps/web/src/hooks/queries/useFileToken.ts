import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { ApiError } from '@/services/http'
import type { FileTokenResponse } from '@snapscale/shared'

import { useAuthContext } from '@/context/AuthContext'
import { getFileToken } from '@/services/auth'
import { decodeJwtExpiryMs, isJwtLive } from '@/utils/jwt'

/** Declared once — the file-token query every image URL in the app reads from. */
export const fileTokenQueryKey = ['file-token'] as const

/**
 * Used only when the current token can't be decoded yet (no data, or a
 * malformed payload) — keeps the query polling at a sane cadence instead of
 * going silent.
 */
const FILE_TOKEN_FALLBACK_REFETCH_MS = 30_000
/** Floor so a token that is already dead (or nearly so) still gets retried, not hammered. */
const FILE_TOKEN_MIN_REFETCH_MS = 1_000
/**
 * A failed poll must not be allowed to push the retry past the 60s
 * server-side expiry while the stale cached token keeps getting served —
 * retry a couple of times, quickly, before giving up for this cycle.
 */
const FILE_TOKEN_RETRY_COUNT = 2
const FILE_TOKEN_RETRY_DELAY_MS = 200

export interface UseFileTokenResult {
  readonly fileToken: string | null
  readonly isLoading: boolean
  readonly error: ApiError | null
  /** Forces a fresh fetch now — call this when an `<img>` using the current token 401s. */
  readonly refresh: () => void
}

/**
 * Schedules the next refetch at roughly half the *remaining* life of the
 * token currently in cache, instead of a fixed tick — a token minted with
 * plenty of life left doesn't need attention soon, and one close to expiry
 * (e.g. after a slow retry) gets chased immediately.
 */
function msUntilNextRefresh(token: string | undefined): number {
  if (token === undefined) {
    return FILE_TOKEN_FALLBACK_REFETCH_MS
  }

  const expiryMs = decodeJwtExpiryMs(token)

  if (expiryMs === null) {
    return FILE_TOKEN_FALLBACK_REFETCH_MS
  }

  const remainingMs = expiryMs - Date.now()

  return Math.max(remainingMs / 2, FILE_TOKEN_MIN_REFETCH_MS)
}

/**
 * Short-lived, scope-limited token for `<img src>` / `?token=` use
 * (`utils/imageUrls.ts`) — replaces passing the 1h session token into image
 * URLs, which leaked a full-access credential into logs/history/Referer
 * (the finding this hook fixes). Only fetches while a session exists.
 */
export function useFileToken(): UseFileTokenResult {
  const { isAuthenticated } = useAuthContext()
  const queryClient = useQueryClient()

  const query = useQuery<FileTokenResponse, ApiError>({
    queryKey: fileTokenQueryKey,
    queryFn: getFileToken,
    enabled: isAuthenticated,
    refetchInterval: (currentQuery) => msUntilNextRefresh(currentQuery.state.data?.token),
    // A backgrounded tab must not let the token die — see queryClient.ts for
    // why the app-wide default (`retry: false`) doesn't apply here.
    refetchIntervalInBackground: true,
    retry: FILE_TOKEN_RETRY_COUNT,
    retryDelay: (attemptIndex) => FILE_TOKEN_RETRY_DELAY_MS * (attemptIndex + 1),
  })

  const rawToken = query.data?.token
  // Never serve a token past its own `exp` — treat it the same as having none.
  const fileToken = rawToken !== undefined && isJwtLive(rawToken) ? rawToken : null

  function refresh(): void {
    void queryClient.invalidateQueries({ queryKey: fileTokenQueryKey })
  }

  return {
    fileToken,
    isLoading: query.isLoading,
    error: query.error,
    refresh,
  }
}
