import { describe, expect, it } from 'vitest'

import { OTP_CODE_PATTERN, emailSchema } from '../value-object-rules.js'

import {
  meResponseSchema,
  requestOtpSchema,
  sessionResponseSchema,
  verifyOtpSchema,
} from './auth.js'

const validUser = {
  id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  email: 'user@example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('requestOtpSchema', () => {
  it('accepts a well-formed email', () => {
    const result = requestOtpSchema.safeParse({ email: 'user@example.com' })

    expect(result.success).toBe(true)
  })

  it('rejects an invalid email with a zod issue on the email field', () => {
    const result = requestOtpSchema.safeParse({ email: 'not-an-email' })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['email'])
    expect(result.error.issues[0]?.message).toBeTruthy()
  })

  it('rejects a missing email field', () => {
    const result = requestOtpSchema.safeParse({})

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['email'])
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
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues.some((issue) => issue.path[0] === 'email')).toBe(true)
  })

  it('rejects a code shorter than 6 digits', () => {
    const result = verifyOtpSchema.safeParse({ email: 'user@example.com', code: '12345' })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['code'])
  })

  it('rejects a code longer than 6 digits', () => {
    const result = verifyOtpSchema.safeParse({ email: 'user@example.com', code: '1234567' })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['code'])
  })

  it('rejects a code containing non-digit characters', () => {
    const result = verifyOtpSchema.safeParse({ email: 'user@example.com', code: 'abcdef' })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['code'])
  })
})

describe('sessionResponseSchema', () => {
  it('accepts a token plus a well-formed user', () => {
    const result = sessionResponseSchema.safeParse({ token: 'jwt.token.value', user: validUser })

    expect(result.success).toBe(true)
  })

  it('rejects a response missing the token', () => {
    const result = sessionResponseSchema.safeParse({ user: validUser })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues.some((issue) => issue.path[0] === 'token')).toBe(true)
  })

  it('rejects a user with a malformed id', () => {
    const result = sessionResponseSchema.safeParse({
      token: 'jwt.token.value',
      user: { ...validUser, id: 'not-a-uuid' },
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues.some((issue) => issue.path.join('.') === 'user.id')).toBe(true)
  })
})

describe('meResponseSchema', () => {
  it('accepts a wrapped user', () => {
    const result = meResponseSchema.safeParse({ user: validUser })

    expect(result.success).toBe(true)
  })

  it('rejects a bare user — `data` is `{ user }`, not the user itself (docs/03 §4)', () => {
    const result = meResponseSchema.safeParse(validUser)

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues.some((issue) => issue.path[0] === 'user')).toBe(true)
  })

  it('rejects a user whose createdAt is not an ISO datetime', () => {
    const result = meResponseSchema.safeParse({ user: { ...validUser, createdAt: 'yesterday' } })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues.some((issue) => issue.path.join('.') === 'user.createdAt')).toBe(
      true,
    )
  })
})

describe('the auth schemas and the value objects they are built from', () => {
  it.each([
    { code: '123456', accepted: true },
    { code: '000000', accepted: true },
    { code: '12345', accepted: false },
    { code: '1234567', accepted: false },
    { code: 'abcdef', accepted: false },
  ])('agrees with OTP_CODE_PATTERN that $code is accepted: $accepted', ({ code, accepted }) => {
    expect(OTP_CODE_PATTERN.test(code)).toBe(accepted)
    expect(verifyOtpSchema.safeParse({ email: 'user@example.com', code }).success).toBe(accepted)
  })

  it.each([
    { email: 'user@example.com', accepted: true },
    { email: 'not-an-email', accepted: false },
    { email: 'user@', accepted: false },
  ])('agrees with emailSchema that $email is accepted: $accepted', ({ email, accepted }) => {
    expect(emailSchema.safeParse(email).success).toBe(accepted)
    expect(requestOtpSchema.safeParse({ email }).success).toBe(accepted)
    expect(verifyOtpSchema.safeParse({ email, code: '123456' }).success).toBe(accepted)
  })

  it('rejects a malformed code with the message the OpenAPI document publishes', () => {
    const result = verifyOtpSchema.safeParse({ email: 'user@example.com', code: '12345' })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.message).toBe('Code must be exactly 6 digits')
  })
})
