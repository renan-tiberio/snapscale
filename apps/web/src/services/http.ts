import { ERROR_CODES, sessionResponseSchema } from '@snapscale/shared'
import axios from 'axios'


import type { ApiResponse, SessionResponse } from '@snapscale/shared'
import type { AxiosError, AxiosResponse } from 'axios'

import { API_BASE_URL } from '@/utils/env'

/** The one localStorage key holding the session (`docs/03-technical-design.md` §5). */
export const AUTH_STORAGE_KEY = 'snapscale.session'

/** Window event fired when the API rejects the token — the auth context listens for it. */
export const LOGOUT_EVENT = 'snapscale:logout'

/** Normalized API failure: always carries the machine-readable contract code. */
export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/** Reads the persisted session, validating it against the shared contract. */
export function readStoredSession(): SessionResponse | null {
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)

  if (raw === null) {
    return null
  }

  try {
    const parsed = sessionResponseSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function storeSession(session: SessionResponse): void {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredSession(): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
}

function toApiError(payload: unknown, status: number): ApiError {
  const envelope = payload as ApiResponse<unknown> | undefined

  return new ApiError(
    envelope?.error?.code ?? ERROR_CODES.INTERNAL,
    envelope?.error?.message ?? 'Unexpected error while contacting the API',
    status,
  )
}

/**
 * The single axios instance every service uses: origin from the environment,
 * Bearer token in, `ApiResponse<T>` envelope out. Components never import it —
 * they go through `hooks/queries/` (`docs/03-technical-design.md` §2).
 */
export const http = axios.create({
  baseURL: API_BASE_URL,
  // fetch first, XHR as fallback: the XHR adapter serializes a multipart
  // `FormData` body to "[object FormData]" once an interceptor (msw in tests,
  // any XHR shim in the browser) touches it — the fetch adapter sends the real
  // multipart payload the upload route expects.
  adapter: ['fetch', 'xhr'],
})

http.interceptors.request.use((config) => {
  const session = readStoredSession()

  if (session !== null) {
    config.headers.set('Authorization', `Bearer ${session.token}`)
  }

  return config
})

http.interceptors.response.use(
  (response: AxiosResponse<ApiResponse<unknown>>) => {
    const envelope = response.data

    if (envelope?.success !== true) {
      throw toApiError(envelope, response.status)
    }

    return { ...response, data: envelope.data }
  },
  (error: AxiosError<ApiResponse<unknown>>) => {
    const status = error.response?.status ?? 0

    if (status === 401) {
      clearStoredSession()
      window.dispatchEvent(new Event(LOGOUT_EVENT))
    }

    throw toApiError(error.response?.data, status)
  },
)
