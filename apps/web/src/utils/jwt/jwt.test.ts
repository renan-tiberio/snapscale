import { describe, expect, it } from 'vitest'

import { decodeJwtExpiryMs, isJwtLive } from './jwt'

import { createFileTokenWithTtlMs, createTestJwt } from '@/test/jwt'

describe('decodeJwtExpiryMs', () => {
  it('reads the exp claim out of a JWT-shaped token, converted to epoch milliseconds', () => {
    const nowMs = Date.parse('2026-08-23T12:00:00.000Z')
    const token = createFileTokenWithTtlMs({ ttlMs: 60_000, nowMs })

    expect(decodeJwtExpiryMs({ token })).toBe(nowMs + 60_000)
  })

  it('returns null for a token that is not JWT-shaped', () => {
    expect(decodeJwtExpiryMs({ token: 'not-a-jwt' })).toBeNull()
  })

  it('returns null when the payload segment is not valid base64url JSON', () => {
    expect(decodeJwtExpiryMs({ token: 'header.not-base64-json.signature' })).toBeNull()
  })

  it('returns null when the payload has no numeric exp claim', () => {
    const token = createTestJwt({ sub: 'test-user', scope: 'file' })

    expect(decodeJwtExpiryMs({ token })).toBeNull()
  })
})

describe('isJwtLive', () => {
  it('is true while the exp claim is still in the future', () => {
    const nowMs = Date.now()
    const token = createFileTokenWithTtlMs({ ttlMs: 60_000, nowMs })

    expect(isJwtLive({ token, nowMs })).toBe(true)
  })

  it('is false once the exp claim has passed', () => {
    const nowMs = Date.now()
    const token = createFileTokenWithTtlMs({ ttlMs: -1_000, nowMs })

    expect(isJwtLive({ token, nowMs })).toBe(false)
  })

  it('is false for a token that cannot be decoded at all', () => {
    expect(isJwtLive({ token: 'garbage' })).toBe(false)
  })
})
