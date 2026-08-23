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
    ['UNAUTHORIZED', ERROR_CODES.UNAUTHORIZED],
    ['NOT_FOUND', ERROR_CODES.NOT_FOUND],
    ['VALIDATION_ERROR', ERROR_CODES.VALIDATION_ERROR],
    ['RATE_LIMITED', ERROR_CODES.RATE_LIMITED],
    ['INTERNAL', ERROR_CODES.INTERNAL],
  ])('maps %s to the literal %s', (key, value) => {
    expect(value).toBe(key)
  })
})
