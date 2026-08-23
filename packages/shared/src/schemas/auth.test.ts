import { describe, expect, it } from 'vitest'

import { requestOtpSchema, sessionResponseSchema, verifyOtpSchema } from './auth.js'

describe('requestOtpSchema', () => {
  it('accepts a well-formed email', () => {
    const result = requestOtpSchema.safeParse({ email: 'user@example.com' })

    expect(result.success).toBe(true)
  })

  it('rejects an invalid email with a zod issue on the email field', () => {
    const result = requestOtpSchema.safeParse({ email: 'not-an-email' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['email'])
      expect(result.error.issues[0]?.message).toBeTruthy()
    }
  })

  it('rejects a missing email field', () => {
    const result = requestOtpSchema.safeParse({})

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['email'])
    }
  })
})

describe('verifyOtpSchema', () => {
  it('accepts a valid email and a 6-digit code', () => {
    const result = verifyOtpSchema.safeParse({ email: 'user@example.com', code: '123456' })

    expect(result.success).toBe(true)
  })

  it('rejects an invalid email with a zod issue on the email field', () => {
    const result = verifyOtpSchema.safeParse({ email: 'nope', code: '123456' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'email')).toBe(true)
    }
  })

  it('rejects a code shorter than 6 digits', () => {
    const result = verifyOtpSchema.safeParse({ email: 'user@example.com', code: '12345' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['code'])
    }
  })

  it('rejects a code longer than 6 digits', () => {
    const result = verifyOtpSchema.safeParse({ email: 'user@example.com', code: '1234567' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['code'])
    }
  })

  it('rejects a code containing non-digit characters', () => {
    const result = verifyOtpSchema.safeParse({ email: 'user@example.com', code: 'abcdef' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['code'])
    }
  })
})

describe('sessionResponseSchema', () => {
  const validUser = {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    email: 'user@example.com',
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  it('accepts a token plus a well-formed user', () => {
    const result = sessionResponseSchema.safeParse({ token: 'jwt.token.value', user: validUser })

    expect(result.success).toBe(true)
  })

  it('rejects a response missing the token', () => {
    const result = sessionResponseSchema.safeParse({ user: validUser })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'token')).toBe(true)
    }
  })

  it('rejects a user with a malformed id', () => {
    const result = sessionResponseSchema.safeParse({
      token: 'jwt.token.value',
      user: { ...validUser, id: 'not-a-uuid' },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'user.id')).toBe(true)
    }
  })
})
