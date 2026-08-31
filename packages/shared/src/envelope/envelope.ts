import { z } from 'zod'

import type { ErrorCode } from '../error-codes/index.js'

export type ApiResponse<T> = {
  readonly success: boolean
  readonly data?: T
  readonly error?: { readonly code: string; readonly message: string }
  readonly meta?: { readonly total: number; readonly page: number; readonly limit: number }
}

/**
 * The zod mirror of `ApiResponse`'s failure side — the api declares it as the OpenAPI
 * `response` shape, the web client parses untrusted bodies with it. `error` is optional
 * so a body that lost it still parses and falls back instead of throwing.
 */
export const errorEnvelopeSchema = z.object({
  success: z.boolean(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
})
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>

export type OkParams<T> = {
  readonly data: T
  readonly meta?: ApiResponse<T>['meta']
}

export const ok = <T>({ data, meta }: OkParams<T>): ApiResponse<T> =>
  meta === undefined ? { success: true, data } : { success: true, data, meta }

export type FailParams = {
  readonly code: ErrorCode | string
  readonly message: string
}

export const fail = ({ code, message }: FailParams): ApiResponse<never> => ({
  success: false,
  error: { code, message },
})
