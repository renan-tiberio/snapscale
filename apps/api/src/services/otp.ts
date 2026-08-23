import { ERROR_CODES } from '@snapscale/shared'

import type { Database } from '@/db/index.js'
import type { User } from '@/repositories/users.js'
import type { Mailer } from '@/services/mailer.js'

import * as otpRepo from '@/repositories/otp.js'
import * as usersRepo from '@/repositories/users.js'
import { sendOtpEmail } from '@/services/mailer.js'
import { generateOtpCode, generateSalt, hashOtpCode, verifyOtpHash } from '@/services/otp-crypto.js'

/** Resend cooldown — `docs/03-technical-design.md` §5 step 1. */
const RESEND_COOLDOWN_MS = 60_000
/** Attempts allowed per code before it is invalidated — §5 step 2. */
const MAX_VERIFY_ATTEMPTS = 5
const INVALID_CODE_MESSAGE = 'Invalid or expired code'

/**
 * Thrown by this module; routes map `code` 1:1 onto the HTTP error envelope
 * (`RATE_LIMITED` → 429, `UNAUTHORIZED` → 401) without inspecting `message`
 * for branching — keeps the oracle-free contract from §4/§5 in one place.
 */
export class OtpServiceError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'OtpServiceError'
    this.code = code
  }
}

export interface RequestOtpDeps {
  readonly db: Database
  readonly mailer: Mailer
  readonly otpTtlSeconds: number
  /** Injected for tests — real callers get the real clock. */
  readonly now?: () => Date
}

/**
 * `docs/03-technical-design.md` §5 step 1: generates the code, stores only
 * its salted hash, invalidates whatever was active for the email, and
 * emails the plaintext code. Always resolves for an unknown email — the
 * *only* observable failure is the resend cooldown, so the endpoint never
 * becomes an email-enumeration oracle.
 */
export async function requestOtp(deps: RequestOtpDeps, email: string): Promise<void> {
  const now = deps.now?.() ?? new Date()
  const active = await otpRepo.findActiveByEmail(deps.db, email, now)

  if (active && now.getTime() - active.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new OtpServiceError(
      ERROR_CODES.RATE_LIMITED,
      'Please wait a minute before requesting another code',
    )
  }

  await otpRepo.invalidateActiveForEmail(deps.db, email, now)

  const code = generateOtpCode()
  const salt = generateSalt()
  const codeHash = hashOtpCode(code, salt)
  const expiresAt = new Date(now.getTime() + deps.otpTtlSeconds * 1000)

  await otpRepo.create(deps.db, { email, codeHash, salt, expiresAt })
  await sendOtpEmail(deps.mailer, { to: email, code })
}

export interface VerifyOtpDeps {
  readonly db: Database
  readonly now?: () => Date
}

export interface VerifyOtpResult {
  readonly user: User
}

/**
 * `docs/03-technical-design.md` §5 step 2: at most `MAX_VERIFY_ATTEMPTS`
 * wrong guesses per code, after which it is invalidated even if the right
 * code follows. Every failure path (absent, expired, wrong, attempts
 * exhausted) throws the same `UNAUTHORIZED` — no oracle distinguishes them.
 */
export async function verifyOtp(
  deps: VerifyOtpDeps,
  email: string,
  code: string,
): Promise<VerifyOtpResult> {
  const now = deps.now?.() ?? new Date()
  const active = await otpRepo.findActiveByEmail(deps.db, email, now)

  if (!active) {
    throw new OtpServiceError(ERROR_CODES.UNAUTHORIZED, INVALID_CODE_MESSAGE)
  }

  const matches = verifyOtpHash(code, active.salt, active.codeHash)

  if (!matches) {
    const updated = await otpRepo.incrementAttempts(deps.db, active.id)
    const attempts = updated?.attempts ?? active.attempts + 1

    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      await otpRepo.markConsumed(deps.db, active.id, now)
    }

    throw new OtpServiceError(ERROR_CODES.UNAUTHORIZED, INVALID_CODE_MESSAGE)
  }

  await otpRepo.markConsumed(deps.db, active.id, now)
  const user = await usersRepo.upsertByEmail(deps.db, email)

  return { user }
}
