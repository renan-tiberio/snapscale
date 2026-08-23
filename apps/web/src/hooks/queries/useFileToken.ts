import { useQuery } from '@tanstack/react-query'

import type { ApiError } from '@/services/http'
import type { FileTokenResponse } from '@snapscale/shared'

import { useAuthContext } from '@/context/AuthContext'
import { getFileToken } from '@/services/auth'

/** Declared once — the file-token query every image URL in the app reads from. */
export const fileTokenQueryKey = ['file-token'] as const

/**
 * The file token is `scope: 'file'` and expires 60s server-side
 * (`routes/file-token.ts`). Refetching every 30s — half the TTL — keeps a
 * fresh token in cache well before the current one expires, so an `<img>`
 * re-render never briefly points at a dead token.
 */
const FILE_TOKEN_STALE_TIME_MS = 30_000
const FILE_TOKEN_REFETCH_INTERVAL_MS = 30_000

export interface UseFileTokenResult {
  readonly fileToken: string | null
  readonly isLoading: boolean
  readonly error: ApiError | null
}

/**
 * Short-lived, scope-limited token for `<img src>` / `?token=` use
 * (`utils/imageUrls.ts`) — replaces passing the 1h session token into image
 * URLs, which leaked a full-access credential into logs/history/Referer
 * (the finding this hook fixes). Only fetches while a session exists.
 */
export function useFileToken(): UseFileTokenResult {
  const { isAuthenticated } = useAuthContext()

  const query = useQuery<FileTokenResponse, ApiError>({
    queryKey: fileTokenQueryKey,
    queryFn: getFileToken,
    enabled: isAuthenticated,
    staleTime: FILE_TOKEN_STALE_TIME_MS,
    refetchInterval: FILE_TOKEN_REFETCH_INTERVAL_MS,
  })

  return {
    fileToken: query.data?.token ?? null,
    isLoading: query.isLoading,
    error: query.error,
  }
}
