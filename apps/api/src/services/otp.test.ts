import { randomUUID } from 'node:crypto'

import { ERROR_CODES } from '@snapscale/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Mailer } from '@/services/mailer.js'

import * as otpRepo from '@/repositories/otp.js'
import { OtpServiceError, requestOtp, verifyOtp } from '@/services/otp.js'
import { createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

const OTP_TTL_SECONDS = 600

function createFakeMailer(): { mailer: Mailer; sent: { to: string; subject: string }[] } {
  const sent: { to: string; subject: string }[] = []
  const mailer: Mailer = {
    sendMail: vi.fn(async (options) => {
      sent.push({ to: options.to, subject: options.subject })
    }),
  }

  return { mailer, sent }
}

function extractCode(subject: string): string {
  const match = subject.match(/\d{6}/)

  if (!match) {
    throw new Error(`no 6-digit code found in subject: ${subject}`)
  }

  return match[0]
}

function first<T>(items: readonly T[]): T {
  const item = items[0]

  if (item === undefined) {
    throw new Error('expected at least one item')
  }

  return item
}

describe('otp service', () => {
  let database: TestDatabase

  beforeAll(async () => {
    database = await createTestDatabase()
  })

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    await truncateAll(database)
  })

  describe('requestOtp', () => {
    it('emails a 6-digit code and stores only its salted hash, never the plaintext', async () => {
      const { mailer, sent } = createFakeMailer()
      const email = 'ada@example.com'

      await requestOtp({ db: database.db, mailer, otpTtlSeconds: OTP_TTL_SECONDS }, email)

      expect(sent).toHaveLength(1)
      const code = extractCode(first(sent).subject)

      const stored = await otpRepo.findActiveByEmail(database.db, email)
      expect(stored).toBeDefined()
      expect(stored?.codeHash).not.toBe(code)
      expect(stored?.codeHash).not.toContain(code)
      expect(stored?.salt).toBeTruthy()
      expect(stored?.attempts).toBe(0)
    })

    it('invalidates the previous active code once a new one is issued after the cooldown', async () => {
      const { mailer } = createFakeMailer()
      const email = 'ada@example.com'
      // otp_codes.created_at defaults to Postgres's own clock (schema.ts
      // `defaultNow()`) — the service's injected `now` only drives the
      // cooldown/expiry math, so the fake clock must stay anchored to real
      // wall-clock time for the comparison against the stored row to mean
      // anything.
      const start = new Date()
      const afterCooldown = new Date(start.getTime() + 61_000)

      await requestOtp(
        { db: database.db, mailer, otpTtlSeconds: OTP_TTL_SECONDS, now: () => start },
        email,
      )
      const firstCode = await otpRepo.findActiveByEmail(database.db, email, start)

      await requestOtp(
        { db: database.db, mailer, otpTtlSeconds: OTP_TTL_SECONDS, now: () => afterCooldown },
        email,
      )
      const second = await otpRepo.findActiveByEmail(database.db, email, afterCooldown)

      expect(firstCode).toBeDefined()
      expect(second).toBeDefined()
      expect(second?.id).not.toBe(firstCode?.id)
    })

    it('rejects a resend within the 60s cooldown with a RATE_LIMITED OtpServiceError', async () => {
      const { mailer, sent } = createFakeMailer()
      const email = 'ada@example.com'
      const now = new Date()

      await requestOtp({ db: database.db, mailer, otpTtlSeconds: OTP_TTL_SECONDS, now: () => now }, email)

      await expect(
        requestOtp({ db: database.db, mailer, otpTtlSeconds: OTP_TTL_SECONDS, now: () => now }, email),
      ).rejects.toMatchObject({
        code: ERROR_CODES.RATE_LIMITED,
      })
      expect(sent).toHaveLength(1)
    })

    it('never reveals whether the email already has an account — same success path either way', async () => {
      const { mailer, sent } = createFakeMailer()

      await expect(
        requestOtp(
          { db: database.db, mailer, otpTtlSeconds: OTP_TTL_SECONDS },
          `unknown-${randomUUID()}@example.com`,
        ),
      ).resolves.toBeUndefined()
      expect(sent).toHaveLength(1)
    })
  })

  describe('verifyOtp', () => {
    async function issueCode(email: string): Promise<{ mailer: Mailer; code: string }> {
      const { mailer, sent } = createFakeMailer()
      await requestOtp({ db: database.db, mailer, otpTtlSeconds: OTP_TTL_SECONDS }, email)
      return { mailer, code: extractCode(first(sent).subject) }
    }

    it('returns the upserted user and consumes the code on a correct guess', async () => {
      const email = 'ada@example.com'
      const { code } = await issueCode(email)

      const result = await verifyOtp({ db: database.db }, email, code)

      expect(result.user.email).toBe(email)
      expect(await otpRepo.findActiveByEmail(database.db, email)).toBeUndefined()
    })

    it('rejects a second use of an already-consumed code with UNAUTHORIZED', async () => {
      const email = 'ada@example.com'
      const { code } = await issueCode(email)

      await verifyOtp({ db: database.db }, email, code)

      await expect(verifyOtp({ db: database.db }, email, code)).rejects.toMatchObject({
        code: ERROR_CODES.UNAUTHORIZED,
      })
    })

    it('rejects a wrong code with UNAUTHORIZED without revealing why', async () => {
      const email = 'ada@example.com'
      const { code } = await issueCode(email)
      const wrongCode = code === '000000' ? '111111' : '000000'

      await expect(verifyOtp({ db: database.db }, email, wrongCode)).rejects.toMatchObject({
        code: ERROR_CODES.UNAUTHORIZED,
      })
    })

    it('rejects when there is no code at all for the email', async () => {
      await expect(
        verifyOtp({ db: database.db }, 'nobody@example.com', '123456'),
      ).rejects.toMatchObject({ code: ERROR_CODES.UNAUTHORIZED })
    })

    it('rejects an expired code with UNAUTHORIZED', async () => {
      const email = 'ada@example.com'
      const { code } = await issueCode(email)

      await database.pool.query(
        `update otp_codes set expires_at = now() - interval '1 minute' where email = $1`,
        [email],
      )

      await expect(verifyOtp({ db: database.db }, email, code)).rejects.toMatchObject({
        code: ERROR_CODES.UNAUTHORIZED,
      })
    })

    it('invalidates the code after 5 wrong attempts — the right code no longer works afterward', async () => {
      const email = 'ada@example.com'
      const { code } = await issueCode(email)
      const wrongCode = code === '000000' ? '111111' : '000000'

      for (let attempt = 0; attempt < 6; attempt += 1) {
        await expect(verifyOtp({ db: database.db }, email, wrongCode)).rejects.toBeInstanceOf(
          OtpServiceError,
        )
      }

      await expect(verifyOtp({ db: database.db }, email, code)).rejects.toMatchObject({
        code: ERROR_CODES.UNAUTHORIZED,
      })
    })
  })
})
