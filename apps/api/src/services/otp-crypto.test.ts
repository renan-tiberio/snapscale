import { describe, expect, it } from 'vitest'

import { generateOtpCode, generateSalt, hashOtpCode, verifyOtpHash } from '@/services/otp-crypto.js'

describe('otp-crypto', () => {
  it('generateOtpCode always returns a zero-padded 6-digit string', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(generateOtpCode()).toMatch(/^\d{6}$/)
    }
  })

  it('generateSalt returns a fresh hex string on every call', () => {
    const a = generateSalt()
    const b = generateSalt()

    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f]+$/)
    expect(a.length).toBeGreaterThan(0)
  })

  it('hashOtpCode is deterministic for the same code and salt', () => {
    expect(hashOtpCode('123456', 'salt')).toBe(hashOtpCode('123456', 'salt'))
  })

  it('hashOtpCode changes when the code or the salt changes', () => {
    const base = hashOtpCode('123456', 'salt')

    expect(hashOtpCode('654321', 'salt')).not.toBe(base)
    expect(hashOtpCode('123456', 'other-salt')).not.toBe(base)
  })

  it('verifyOtpHash returns true only for the exact code+salt pair that produced the hash', () => {
    const salt = generateSalt()
    const hash = hashOtpCode('123456', salt)

    expect(verifyOtpHash('123456', salt, hash)).toBe(true)
    expect(verifyOtpHash('000000', salt, hash)).toBe(false)
    expect(verifyOtpHash('123456', generateSalt(), hash)).toBe(false)
  })

  it('verifyOtpHash returns false without throwing when the hash length differs', () => {
    expect(verifyOtpHash('123456', 'salt', 'not-a-real-hash')).toBe(false)
  })
})
