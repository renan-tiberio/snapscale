import { describe, expect, it } from 'vitest'

import { fail, ok } from './envelope.js'

describe('ok', () => {
  it('wraps data in a success envelope', () => {
    const response = ok({ id: '1' })

    expect(response.success).toBe(true)
    expect(response.data).toEqual({ id: '1' })
    expect(response.error).toBeUndefined()
  })

  it('attaches pagination meta when provided', () => {
    const response = ok([1, 2, 3], { total: 30, page: 1, limit: 3 })

    expect(response.meta).toEqual({ total: 30, page: 1, limit: 3 })
  })
})

describe('fail', () => {
  it('builds a failure envelope with the error code and message, and no data', () => {
    const response = fail('NOT_FOUND', 'Album not found')

    expect(response.success).toBe(false)
    expect(response.data).toBeUndefined()
    expect(response.error).toEqual({ code: 'NOT_FOUND', message: 'Album not found' })
  })
})
