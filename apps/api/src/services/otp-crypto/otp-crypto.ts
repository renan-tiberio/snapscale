import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

import { OTP_CODE_LENGTH, OtpCode } from '@snapscale/shared'

import { hashHex } from '@/services/hashing/index.js'

const DECIMAL_BASE = 10
/** `randomInt`'s upper bound is exclusive, so this spans "000000" through "999999". */
const CODE_UPPER_BOUND_EXCLUSIVE = DECIMAL_BASE ** OTP_CODE_LENGTH
const SALT_BYTES = 16

/** Crypto-safe, not `Math.random`. */
export const generateOtpCode = (): OtpCode =>
  new OtpCode(randomInt(0, CODE_UPPER_BOUND_EXCLUSIVE).toString().padStart(OTP_CODE_LENGTH, '0'))

/** A fresh per-code salt — never reused across codes. */
export const generateSalt = (): string => randomBytes(SALT_BYTES).toString('hex')

type HashOtpCodeParams = {
  readonly code: OtpCode
  readonly salt: string
}

/** The stored value: the plaintext code never reaches `otp_codes`. */
export const hashOtpCode = ({ code, salt }: HashOtpCodeParams): string =>
  hashHex({ value: `${code.value}${salt}` })

type VerifyOtpHashParams = HashOtpCodeParams & {
  readonly expectedHash: string
}

/**
 * `timingSafeEqual`, so a wrong guess never leaks how many leading bytes matched through
 * response-time differences.
 */
export const verifyOtpHash = ({ code, salt, expectedHash }: VerifyOtpHashParams): boolean => {
  const actual = Buffer.from(hashOtpCode({ code, salt }), 'utf8')
  const expected = Buffer.from(expectedHash, 'utf8')

  if (actual.length !== expected.length) {
    return false
  }

  return timingSafeEqual(actual, expected)
}
