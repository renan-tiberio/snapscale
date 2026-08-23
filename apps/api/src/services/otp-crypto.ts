import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * Crypto-safe OTP primitives — `docs/03-technical-design.md` §5. The
 * plaintext code never lands in storage; only `hashOtpCode`'s output does,
 * alongside the per-code salt from `generateSalt` (schema: `otp_codes.salt`).
 */

const CODE_LENGTH = 6
// randomInt's upper bound is exclusive, so 10**CODE_LENGTH covers every
// zero-padded 6-digit string from "000000" to "999999".
const CODE_UPPER_BOUND_EXCLUSIVE = 10 ** CODE_LENGTH
const SALT_BYTES = 16

/** A crypto-safe (not `Math.random`) 6-digit code, zero-padded. */
export function generateOtpCode(): string {
  return randomInt(0, CODE_UPPER_BOUND_EXCLUSIVE).toString().padStart(CODE_LENGTH, '0')
}

/** A fresh per-code salt — never reused across codes. */
export function generateSalt(): string {
  return randomBytes(SALT_BYTES).toString('hex')
}

/** sha256(code + salt), hex-encoded — what actually gets stored. */
export function hashOtpCode(code: string, salt: string): string {
  return createHash('sha256').update(`${code}${salt}`).digest('hex')
}

/**
 * Recomputes the hash for `code`+`salt` and compares it to `expectedHash` in
 * constant time (`timingSafeEqual`), so a wrong guess never leaks how many
 * leading bytes matched via response-time differences.
 */
export function verifyOtpHash(code: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashOtpCode(code, salt), 'utf8')
  const expected = Buffer.from(expectedHash, 'utf8')

  if (actual.length !== expected.length) {
    return false
  }

  return timingSafeEqual(actual, expected)
}
