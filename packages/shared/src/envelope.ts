import type { ErrorCode } from './error-codes.js'

/**
 * Response envelope every API route returns. Single source of truth for
 * `docs/03-technical-design.md` §4.
 */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
  meta?: { total: number; page: number; limit: number }
}

/** Builds a success envelope, optionally carrying pagination meta. */
export function ok<T>(data: T, meta?: ApiResponse<T>['meta']): ApiResponse<T> {
  return meta === undefined ? { success: true, data } : { success: true, data, meta }
}

/** Builds a failure envelope; `data` stays absent. */
export function fail(code: ErrorCode | string, message: string): ApiResponse<never> {
  return { success: false, error: { code, message } }
}
