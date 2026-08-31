import { describe, expect, it } from 'vitest'

import { ERROR_CODES } from './error-codes.js'

describe('ERROR_CODES', () => {
  it('exposes exactly the phase-1 machine-readable codes', () => {
    expect(ERROR_CODES).toEqual({
      UNAUTHORIZED: 'UNAUTHORIZED',
      NOT_FOUND: 'NOT_FOUND',
      VALIDATION_ERROR: 'VALIDATION_ERROR',
      RATE_LIMITED: 'RATE_LIMITED',
      INTERNAL: 'INTERNAL',
    })
  })

  it.each([
    { key: 'UNAUTHORIZED', value: ERROR_CODES.UNAUTHORIZED },
    { key: 'NOT_FOUND', value: ERROR_CODES.NOT_FOUND },
    { key: 'VALIDATION_ERROR', value: ERROR_CODES.VALIDATION_ERROR },
    { key: 'RATE_LIMITED', value: ERROR_CODES.RATE_LIMITED },
    { key: 'INTERNAL', value: ERROR_CODES.INTERNAL },
  ])('maps $key to the literal $value', ({ key, value }) => {
    expect(value).toBe(key)
  })
})
