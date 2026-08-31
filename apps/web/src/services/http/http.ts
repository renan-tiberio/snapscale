import { ERROR_CODES, HTTP_STATUS, errorEnvelopeSchema } from '@snapscale/shared'
import axios from 'axios'

import type { ApiResponse, SessionResponse } from '@snapscale/shared'
import type { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'

import { getItem, removeItem, setItem } from '@/services/storage'
import { API_BASE_URL } from '@/utils/env'
import { emitAppEvent } from '@/utils/events'

const GENERIC_ERROR_MESSAGE = 'Unexpected error while contacting the API'

type ApiErrorParams = { code: string; message: string; status: number }

/** Normalized API failure: always carries the machine-readable contract code. */
export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor({ code, message, status }: ApiErrorParams) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/** Reads the persisted session (`services/storage` schema key `session`). */
export const readStoredSession = (): SessionResponse | null => getItem({ key: 'session' })

export const storeSession = (session: SessionResponse): void => {
  setItem({ key: 'session', value: session })
}

export const clearStoredSession = (): void => {
  removeItem({ key: 'session' })
}

type ToApiErrorParams = { payload: unknown; status: number }

const toApiError = ({ payload, status }: ToApiErrorParams): ApiError => {
  const parsed = errorEnvelopeSchema.safeParse(payload)

  if (!parsed.success) {
    return new ApiError({ code: ERROR_CODES.INTERNAL, message: GENERIC_ERROR_MESSAGE, status })
  }

  return new ApiError({
    code: parsed.data.error?.code ?? ERROR_CODES.INTERNAL,
    message: parsed.data.error?.message ?? GENERIC_ERROR_MESSAGE,
    status,
  })
}

/**
 * The single axios instance behind `http` below: origin from the environment,
 * Bearer token in, `ApiResponse<T>` envelope out. Not exported — services go
 * through `http`, components through `hooks/queries/`.
 */
const client = axios.create({
  baseURL: API_BASE_URL,
  // fetch first, XHR as fallback: the XHR adapter serializes a multipart
  // `FormData` body to "[object FormData]" once an interceptor (msw in tests,
  // any XHR shim in the browser) touches it — the fetch adapter sends the real
  // multipart payload the upload route expects.
  adapter: ['fetch', 'xhr'],
})

client.interceptors.request.use((config) => {
  const session = readStoredSession()

  if (session !== null) {
    config.headers.set('Authorization', `Bearer ${session.token}`)
  }

  return config
})

client.interceptors.response.use(
  (response: AxiosResponse<ApiResponse<unknown>>) => {
    const envelope = response.data

    if (envelope?.success !== true) {
      throw toApiError({ payload: envelope, status: response.status })
    }

    return { ...response, data: envelope.data }
  },
  (error: AxiosError<ApiResponse<unknown>>) => {
    const status = error.response?.status ?? 0

    if (status === HTTP_STATUS.UNAUTHORIZED) {
      clearStoredSession()
      emitAppEvent({ name: 'auth/logout', payload: undefined })
    }

    throw toApiError({ payload: error.response?.data, status })
  },
)

/**
 * A hung request (dead network, a server that never answers) must not stall
 * forever — axios's own default is `0`, i.e. never time out. A stuck
 * `/auth/file-token` call under that default would never settle, and the
 * refresh loop in `hooks/queries/useFileToken.ts` would stop for good.
 */
export const REQUEST_TIMEOUT_MS = 15_000 // 15 seconds

/**
 * Deliberately NOT axios's own `timeout` (or a `signal`) option: both route
 * through the fetch adapter's `composeSignals` helper, which always builds a
 * fresh `new AbortController()` off of whatever `AbortController` happens to
 * be the ambient global. Under `environment: 'jsdom'` that global is jsdom's
 * AbortController, not Node's — and Node's own `fetch` (the adapter this
 * client prefers, see above) rejects any signal that isn't an instance of
 * *its* AbortSignal, so every mocked request fails outright, not just slow
 * ones. Timing out the returned promise ourselves — without ever touching
 * AbortController — sidesteps it while still bounding every caller's wait.
 */
const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/max-params -- the Promise constructor's executor signature, (resolve, reject), is fixed by the language
  new Promise<T>((resolve, reject) => {
    let settled = false
    const timeoutId = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      reject(
        new ApiError({ code: ERROR_CODES.INTERNAL, message: GENERIC_ERROR_MESSAGE, status: 0 }),
      )
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

type RequestParams = { url: string; config?: AxiosRequestConfig }
type BodyRequestParams = RequestParams & { data?: unknown }

/**
 * The HTTP verbs `services/*.ts` are allowed to use. A new object, never a
 * patched axios instance: the client above keeps its own methods, and every
 * call routed through here is bounded by `REQUEST_TIMEOUT_MS`.
 */
export const http = {
  get: <T = unknown>({ url, config }: RequestParams): Promise<AxiosResponse<T>> =>
    withTimeout(client.get<T>(url, config)),
  post: <T = unknown>({ url, data, config }: BodyRequestParams): Promise<AxiosResponse<T>> =>
    withTimeout(client.post<T>(url, data, config)),
  patch: <T = unknown>({ url, data, config }: BodyRequestParams): Promise<AxiosResponse<T>> =>
    withTimeout(client.patch<T>(url, data, config)),
  delete: <T = unknown>({ url, config }: RequestParams): Promise<AxiosResponse<T>> =>
    withTimeout(client.delete<T>(url, config)),
} as const
