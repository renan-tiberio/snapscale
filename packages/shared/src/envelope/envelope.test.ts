import { describe, expect, it } from 'vitest'

import { errorEnvelopeSchema, fail, ok } from './envelope.js'

describe('ok', () => {
  it('wraps data in a success envelope', () => {
    const response = ok({ data: { id: '1' } })

    expect(response.success).toBe(true)
    expect(response.data).toEqual({ id: '1' })
    expect(response.error).toBeUndefined()
  })

  it('attaches pagination meta when provided', () => {
    const response = ok({ data: [1, 2, 3], meta: { total: 30, page: 1, limit: 3 } })

    expect(response.meta).toEqual({ total: 30, page: 1, limit: 3 })
  })
})

describe('fail', () => {
  it('builds a failure envelope with the error code and message, and no data', () => {
    const response = fail({ code: 'NOT_FOUND', message: 'Album not found' })

    expect(response.success).toBe(false)
    expect(response.data).toBeUndefined()
    expect(response.error).toEqual({ code: 'NOT_FOUND', message: 'Album not found' })
  })
})

describe('errorEnvelopeSchema', () => {
  it('parses the envelope `fail` produces', () => {
    const parsed = errorEnvelopeSchema.safeParse(
      fail({ code: 'NOT_FOUND', message: 'Album not found' }),
    )

    expect(parsed.success).toBe(true)
    expect(parsed.data?.error).toEqual({ code: 'NOT_FOUND', message: 'Album not found' })
  })

  it('parses a failure body that carries no error object', () => {
    const parsed = errorEnvelopeSchema.safeParse({ success: false })

    expect(parsed.success).toBe(true)
    expect(parsed.data?.error).toBeUndefined()
  })

  it('rejects a body with no success flag', () => {
    const parsed = errorEnvelopeSchema.safeParse({ error: { code: 'INTERNAL', message: 'boom' } })

    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.path).toEqual(['success'])
  })

  it('rejects an error object missing its machine-readable code', () => {
    const parsed = errorEnvelopeSchema.safeParse({ success: false, error: { message: 'boom' } })

    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.path).toEqual(['error', 'code'])
  })
})
