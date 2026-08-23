import { ERROR_CODES } from '@snapscale/shared'
import axios from 'axios'
import { z } from 'zod'

import type { ApiResponse, SessionResponse } from '@snapscale/shared'
import type { AxiosError, AxiosResponse } from 'axios'

import { getItem, removeItem, setItem } from '@/services/storage'
import { API_BASE_URL } from '@/utils/env'
import { emitAppEvent } from '@/utils/events'

const GENERIC_ERROR_MESSAGE = 'Unexpected error while contacting the API'

/**
 * Minimal shape of the `ApiResponse<T>` envelope needed to build an `ApiError`
 * — just enough to validate an untrusted response body before reading it.
 */
const errorEnvelopeSchema = z.object({
  success: z.boolean(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
})

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

/** Reads the persisted session (`services/storage` schema key `session`). */
export function readStoredSession(): SessionResponse | null {
  return getItem('session')
}

export function storeSession(session: SessionResponse): void {
  setItem('session', session)
}

export function clearStoredSession(): void {
  removeItem('session')
}

function toApiError(payload: unknown, status: number): ApiError {
  const parsed = errorEnvelopeSchema.safeParse(payload)

  if (!parsed.success) {
    return new ApiError(ERROR_CODES.INTERNAL, GENERIC_ERROR_MESSAGE, status)
  }

  return new ApiError(
    parsed.data.error?.code ?? ERROR_CODES.INTERNAL,
    parsed.data.error?.message ?? GENERIC_ERROR_MESSAGE,
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
      emitAppEvent('auth/logout', undefined)
    }

    throw toApiError(error.response?.data, status)
  },
)
