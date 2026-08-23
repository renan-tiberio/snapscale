/**
 * Machine-readable error codes shared by every service. Mirrors
 * `docs/03-technical-design.md` §4: 401 UNAUTHORIZED, 404 NOT_FOUND,
 * 422 VALIDATION_ERROR, 429 RATE_LIMITED, 500 INTERNAL.
 */
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]
