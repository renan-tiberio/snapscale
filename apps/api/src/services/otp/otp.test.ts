import { randomUUID } from 'node:crypto'

import { ERROR_CODES, Email, OtpCode } from '@snapscale/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MailOptions, Mailer } from '@/services/mailer/index.js'

import * as otpRepo from '@/repositories/otp/index.js'
import { OtpServiceError, requestOtp, verifyOtp } from '@/services/otp/index.js'
import { createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

const OTP_TTL_SECONDS = 600 // 10 minutes
const COOLDOWN_ELAPSED_MS = 61_000 // 61 seconds — one second past the resend cooldown

type FakeMailer = {
  readonly mailer: Mailer
  /** Reads the spy's own call log, so nothing has to be pushed into a mutable array. */
  readonly sent: () => readonly MailOptions[]
}

const createFakeMailer = (): FakeMailer => {
  const sendMail = vi.fn<Mailer['sendMail']>(async () => undefined)

  return {
    mailer: { sendMail },
    sent: () => sendMail.mock.calls.map((call) => call[0]),
  }
}

const extractCode = ({ subject }: { readonly subject: string }): OtpCode => {
  const match = subject.match(/\d{6}/)

  if (!match) {
    throw new Error(`no 6-digit code found in subject: ${subject}`)
  }

  return new OtpCode(match[0])
}

const first = <T>({ items }: { readonly items: readonly T[] }): T => {
  const item = items[0]

  if (item === undefined) {
    throw new Error('expected at least one item')
  }

  return item
}

const otherCode = ({ code }: { readonly code: OtpCode }): OtpCode =>
  code.value === '000000' ? new OtpCode('111111') : new OtpCode('000000')

describe('otp service', () => {
  let database: TestDatabase

  beforeAll(async () => {
    database = await createTestDatabase()
  })

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    await truncateAll({ handle: database })
  })

  describe('requestOtp', () => {
    it('emails a 6-digit code and stores only its salted hash, never the plaintext', async () => {
      const { mailer, sent } = createFakeMailer()
      const email = new Email('ada@example.com')

      await requestOtp({ db: database.db, mailer, otpTtlSeconds: OTP_TTL_SECONDS, email })

      expect(sent()).toHaveLength(1)
      const code = extractCode({ subject: first({ items: sent() }).subject })

      const stored = await otpRepo.findActiveByEmail({ db: database.db, email })
      expect(stored).toBeDefined()
      expect(stored?.codeHash).not.toBe(code.value)
      expect(stored?.codeHash).not.toContain(code.value)
      expect(stored?.salt).toBeTruthy()
      expect(stored?.attempts).toBe(0)
    })

    it('invalidates the previous active code once a new one is issued after the cooldown', async () => {
      const { mailer } = createFakeMailer()
      const email = new Email('ada@example.com')
      // `otp_codes.created_at` defaults to Postgres's own clock, so the injected clock has to
      // stay anchored to real wall-clock time for the cooldown comparison to mean anything.
      const start = new Date()
      const afterCooldown = new Date(start.getTime() + COOLDOWN_ELAPSED_MS)

      await requestOtp({
        db: database.db,
        mailer,
        otpTtlSeconds: OTP_TTL_SECONDS,
        email,
        now: () => start,
      })
      const firstCode = await otpRepo.findActiveByEmail({ db: database.db, email, now: start })

      await requestOtp({
        db: database.db,
        mailer,
        otpTtlSeconds: OTP_TTL_SECONDS,
        email,
        now: () => afterCooldown,
      })
      const second = await otpRepo.findActiveByEmail({
        db: database.db,
        email,
        now: afterCooldown,
      })

      expect(firstCode).toBeDefined()
      expect(second).toBeDefined()
      expect(second?.id).not.toBe(firstCode?.id)
    })

    it('rejects a resend within the 60s cooldown with a RATE_LIMITED OtpServiceError', async () => {
      const { mailer, sent } = createFakeMailer()
      const email = new Email('ada@example.com')
      const now = new Date()

      await requestOtp({
        db: database.db,
        mailer,
        otpTtlSeconds: OTP_TTL_SECONDS,
        email,
        now: () => now,
      })

      await expect(
        requestOtp({
          db: database.db,
          mailer,
          otpTtlSeconds: OTP_TTL_SECONDS,
          email,
          now: () => now,
        }),
      ).rejects.toMatchObject({
        code: ERROR_CODES.RATE_LIMITED,
      })
      expect(sent()).toHaveLength(1)
    })

    it('never reveals whether the email already has an account — same success path either way', async () => {
      const { mailer, sent } = createFakeMailer()

      await expect(
        requestOtp({
          db: database.db,
          mailer,
          otpTtlSeconds: OTP_TTL_SECONDS,
          email: new Email(`unknown-${randomUUID()}@example.com`),
        }),
      ).resolves.toBeUndefined()
      expect(sent()).toHaveLength(1)
    })
  })

  describe('verifyOtp', () => {
    const issueCode = async ({ email }: { readonly email: Email }): Promise<OtpCode> => {
      const { mailer, sent } = createFakeMailer()
      await requestOtp({ db: database.db, mailer, otpTtlSeconds: OTP_TTL_SECONDS, email })
      return extractCode({ subject: first({ items: sent() }).subject })
    }

    it('returns the upserted user and consumes the code on a correct guess', async () => {
      const email = new Email('ada@example.com')
      const code = await issueCode({ email })

      const result = await verifyOtp({ db: database.db, email, code })

      expect(result.user.email).toBe('ada@example.com')
      expect(await otpRepo.findActiveByEmail({ db: database.db, email })).toBeUndefined()
    })

    it('rejects a second use of an already-consumed code with UNAUTHORIZED', async () => {
      const email = new Email('ada@example.com')
      const code = await issueCode({ email })

      await verifyOtp({ db: database.db, email, code })

      await expect(verifyOtp({ db: database.db, email, code })).rejects.toMatchObject({
        code: ERROR_CODES.UNAUTHORIZED,
      })
    })

    it('rejects a wrong code with UNAUTHORIZED without revealing why', async () => {
      const email = new Email('ada@example.com')
      const code = await issueCode({ email })

      await expect(
        verifyOtp({ db: database.db, email, code: otherCode({ code }) }),
      ).rejects.toMatchObject({
        code: ERROR_CODES.UNAUTHORIZED,
      })
    })

    it('rejects when there is no code at all for the email', async () => {
      await expect(
        verifyOtp({
          db: database.db,
          email: new Email('nobody@example.com'),
          code: new OtpCode('123456'),
        }),
      ).rejects.toMatchObject({ code: ERROR_CODES.UNAUTHORIZED })
    })

    it('rejects an expired code with UNAUTHORIZED', async () => {
      const email = new Email('ada@example.com')
      const code = await issueCode({ email })

      await database.pool.query(
        `update otp_codes set expires_at = now() - interval '1 minute' where email = $1`,
        [email.value],
      )

      await expect(verifyOtp({ db: database.db, email, code })).rejects.toMatchObject({
        code: ERROR_CODES.UNAUTHORIZED,
      })
    })

    it('keeps the code usable through exactly 4 wrong attempts — the right code still verifies', async () => {
      const email = new Email('ada@example.com')
      const code = await issueCode({ email })
      const wrongCode = otherCode({ code })

      for (let attempt = 0; attempt < 4; attempt += 1) {
        await expect(verifyOtp({ db: database.db, email, code: wrongCode })).rejects.toBeInstanceOf(
          OtpServiceError,
        )
      }

      const result = await verifyOtp({ db: database.db, email, code })
      expect(result.user.email).toBe('ada@example.com')
    })

    it('invalidates the code after exactly 5 wrong attempts — the right code no longer works afterward', async () => {
      const email = new Email('ada@example.com')
      const code = await issueCode({ email })
      const wrongCode = otherCode({ code })

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await expect(verifyOtp({ db: database.db, email, code: wrongCode })).rejects.toBeInstanceOf(
          OtpServiceError,
        )
      }

      await expect(verifyOtp({ db: database.db, email, code })).rejects.toMatchObject({
        code: ERROR_CODES.UNAUTHORIZED,
      })
    })
  })
})
