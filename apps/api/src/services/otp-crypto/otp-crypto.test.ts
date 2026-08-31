import { OtpCode } from '@snapscale/shared'
import { describe, expect, it } from 'vitest'

import {
  generateOtpCode,
  generateSalt,
  hashOtpCode,
  verifyOtpHash,
} from '@/services/otp-crypto/index.js'

describe('otp-crypto', () => {
  it('generateOtpCode always returns a zero-padded 6-digit string', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(generateOtpCode().value).toMatch(/^\d{6}$/)
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
    expect(hashOtpCode({ code: new OtpCode('123456'), salt: 'salt' })).toBe(
      hashOtpCode({ code: new OtpCode('123456'), salt: 'salt' }),
    )
  })

  it('hashOtpCode changes when the code or the salt changes', () => {
    const base = hashOtpCode({ code: new OtpCode('123456'), salt: 'salt' })

    expect(hashOtpCode({ code: new OtpCode('654321'), salt: 'salt' })).not.toBe(base)
    expect(hashOtpCode({ code: new OtpCode('123456'), salt: 'other-salt' })).not.toBe(base)
  })

  it('verifyOtpHash returns true only for the exact code+salt pair that produced the hash', () => {
    const salt = generateSalt()
    const expectedHash = hashOtpCode({ code: new OtpCode('123456'), salt })

    expect(verifyOtpHash({ code: new OtpCode('123456'), salt, expectedHash })).toBe(true)
    expect(verifyOtpHash({ code: new OtpCode('000000'), salt, expectedHash })).toBe(false)
    expect(verifyOtpHash({ code: new OtpCode('123456'), salt: generateSalt(), expectedHash })).toBe(
      false,
    )
  })

  it('verifyOtpHash returns false without throwing when the hash length differs', () => {
    expect(
      verifyOtpHash({ code: new OtpCode('123456'), salt: 'salt', expectedHash: 'not-a-real-hash' }),
    ).toBe(false)
  })
})
