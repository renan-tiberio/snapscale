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
    ['UNAUTHORIZED', 'UNAUTHORIZED'],
    ['NOT_FOUND', 'NOT_FOUND'],
    ['VALIDATION_ERROR', 'VALIDATION_ERROR'],
    ['RATE_LIMITED', 'RATE_LIMITED'],
    ['INTERNAL', 'INTERNAL'],
  ])('maps %s to the literal %s', (key, value) => {
    expect(ERROR_CODES[key]).toBe(value)
  })
})
