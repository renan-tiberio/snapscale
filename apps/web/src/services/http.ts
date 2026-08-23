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

/**
 * A hung request (dead network, a server that never answers) must not stall
 * forever — axios's own default is `0`, i.e. never time out. A stuck
 * `/auth/file-token` call under that default would never settle, and the
 * refresh loop in `hooks/queries/useFileToken.ts` would stop for good. 15s
 * is generous for every route this instance serves.
 */
export const REQUEST_TIMEOUT_MS = 15_000

/**
 * Deliberately NOT axios's own `timeout` (or a `signal`) option: both route
 * through the fetch adapter's `composeSignals` helper, which always builds a
 * fresh `new AbortController()` off of whatever `AbortController` happens to
 * be the ambient global. Under `environment: 'jsdom'` that global is jsdom's
 * AbortController, not Node's — and Node's own `fetch` (the adapter this
 * instance prefers, see above) rejects any signal that isn't an instance of
 * *its* AbortSignal, so every mocked request fails outright, not just slow
 * ones. Real browsers only ever have one AbortController, so this is a test
 * -environment-only trap. Timing out the returned promise ourselves — without
 * ever touching AbortController — sidesteps it while still giving every
 * caller (`services/*.ts`) a bounded wait.
 */
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timeoutId = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      reject(new ApiError(ERROR_CODES.INTERNAL, GENERIC_ERROR_MESSAGE, 0))
    }, REQUEST_TIMEOUT_MS)

    promise.then(
      (value) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeoutId)
        resolve(value)
      },
      (error: unknown) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

// Every verb `services/*.ts` calls (`http.get/.post/.patch/.delete`) is
// rewrapped in place, after the interceptors above are wired, so callers
// keep using `http.get(...)` exactly as before — only now it's bounded by
// `REQUEST_TIMEOUT_MS` regardless of which route it calls.
type HttpGet = typeof http.get
type HttpPost = typeof http.post
type HttpPatch = typeof http.patch
type HttpDelete = typeof http.delete

const rawGet: HttpGet = http.get.bind(http)
const rawPost: HttpPost = http.post.bind(http)
const rawPatch: HttpPatch = http.patch.bind(http)
const rawDelete: HttpDelete = http.delete.bind(http)

http.get = ((url, config) => withTimeout(rawGet(url, config))) as HttpGet
http.post = ((url, data, config) => withTimeout(rawPost(url, data, config))) as HttpPost
http.patch = ((url, data, config) => withTimeout(rawPatch(url, data, config))) as HttpPatch
http.delete = ((url, config) => withTimeout(rawDelete(url, config))) as HttpDelete
