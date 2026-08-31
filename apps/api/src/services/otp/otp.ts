import { ERROR_CODES } from '@snapscale/shared'

import type { Database } from '@/db/index.js'
import type { User } from '@/repositories/users/index.js'
import type { Mailer } from '@/services/mailer/index.js'
import type { Email, OtpCode } from '@snapscale/shared'

import * as otpRepo from '@/repositories/otp/index.js'
import * as usersRepo from '@/repositories/users/index.js'
import { sendOtpEmail } from '@/services/mailer/index.js'
import {
  generateOtpCode,
  generateSalt,
  hashOtpCode,
  verifyOtpHash,
} from '@/services/otp-crypto/index.js'

const MS_PER_SECOND = 1000
const RESEND_COOLDOWN_MS = 60_000 // 1 minute
const MAX_VERIFY_ATTEMPTS = 5
const INVALID_CODE_MESSAGE = 'Invalid or expired code'
const RESEND_TOO_SOON_MESSAGE = 'Please wait a minute before requesting another code'

export type OtpServiceErrorParams = {
  readonly code: string
  readonly message: string
}

/**
 * Routes map `code` 1:1 onto the HTTP error envelope (`RATE_LIMITED` → 429, `UNAUTHORIZED` →
 * 401) and never branch on `message`, which is what keeps the oracle-free contract in one place.
 */
export class OtpServiceError extends Error {
  readonly code: string

  constructor({ code, message }: OtpServiceErrorParams) {
    super(message)
    this.name = 'OtpServiceError'
    this.code = code
  }
}

type RequestOtpParams = {
  readonly db: Database
  readonly mailer: Mailer
  readonly otpTtlSeconds: number
  readonly email: Email
  /** Injected for tests — real callers get the real clock. */
  readonly now?: () => Date
}

/**
 * Generates the code, stores only its salted hash, invalidates whatever was active for the
 * email, and mails the plaintext. Always resolves for an unknown email: the only observable
 * failure is the resend cooldown, so the endpoint never becomes an email-enumeration oracle.
 */
export const requestOtp = async ({
  db,
  mailer,
  otpTtlSeconds,
  email,
  now = () => new Date(),
}: RequestOtpParams): Promise<void> => {
  const requestedAt = now()
  const active = await otpRepo.findActiveByEmail({ db, email, now: requestedAt })

  if (active && requestedAt.getTime() - active.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new OtpServiceError({
      code: ERROR_CODES.RATE_LIMITED,
      message: RESEND_TOO_SOON_MESSAGE,
    })
  }

  await otpRepo.invalidateActiveForEmail({ db, email, consumedAt: requestedAt })

  const code = generateOtpCode()
  const salt = generateSalt()
  const codeHash = hashOtpCode({ code, salt })
  const expiresAt = new Date(requestedAt.getTime() + otpTtlSeconds * MS_PER_SECOND)

  await otpRepo.create({ db, email, codeHash, salt, expiresAt })
  await sendOtpEmail({ mailer, to: email, code })
}

type VerifyOtpParams = {
  readonly db: Database
  readonly email: Email
  readonly code: OtpCode
  readonly now?: () => Date
}

export type VerifyOtpResult = {
  readonly user: User
}

/**
 * At most `MAX_VERIFY_ATTEMPTS` wrong guesses per code, after which it is invalidated even if
 * the right code follows. Absent, expired, wrong and exhausted all throw the same
 * `UNAUTHORIZED` — no oracle distinguishes them.
 */
export const verifyOtp = async ({
  db,
  email,
  code,
  now = () => new Date(),
}: VerifyOtpParams): Promise<VerifyOtpResult> => {
  const verifiedAt = now()
  const active = await otpRepo.findActiveByEmail({ db, email, now: verifiedAt })

  if (!active) {
    throw new OtpServiceError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: INVALID_CODE_MESSAGE,
    })
  }

  const matches = verifyOtpHash({ code, salt: active.salt, expectedHash: active.codeHash })

  if (!matches) {
    const updated = await otpRepo.incrementAttempts({ db, id: active.id })
    const attempts = updated?.attempts ?? active.attempts + 1

    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      await otpRepo.markConsumed({ db, id: active.id, consumedAt: verifiedAt })
    }

    throw new OtpServiceError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: INVALID_CODE_MESSAGE,
    })
  }

  await otpRepo.markConsumed({ db, id: active.id, consumedAt: verifiedAt })
  const user = await usersRepo.upsertByEmail({ db, email })

  return { user }
}
