import { randomUUID } from 'node:crypto'

import { ERROR_CODES } from '@snapscale/shared'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { App } from '@/app.js'
import type { Mailer } from '@/services/mailer.js'

import { buildApp } from '@/app.js'
import { createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

/**
 * docs/03 §5.3: "`@fastify/rate-limit` on both auth routes (per-IP +
 * per-email)". `/auth/otp/verify` only had the per-IP limiter plus the
 * per-*code* 5-attempt cap — and that cap resets the moment a fresh code is
 * requested, so an attacker willing to re-request could keep guessing
 * indefinitely against one address. These specs pin both keys.
 *
 * Every test builds its own app: the rate-limit store lives on the instance,
 * so a shared one would leak counters between tests (and into
 * `auth.test.ts`).
 */

const JWT_SECRET = 'test-auth-rate-limit-secret'
const OTP_TTL_SECONDS = 600

/** `/auth/otp/verify` never sends mail — the transport only has to exist. */
const silentMailer: Mailer = { sendMail: async () => undefined }

interface Envelope {
  readonly success: boolean
  readonly error?: { readonly code: string; readonly message: string }
}

function uniqueEmail(): string {
  return `rate-${randomUUID()}@example.com`
}

describe('auth rate limiting (docs/03 §5.3 — per-IP AND per-email)', () => {
  let database: TestDatabase
  let app: App

  beforeAll(async () => {
    database = await createTestDatabase()
  }, 60_000)

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    await truncateAll(database)
    app = await buildApp({
      logger: false,
      db: database.db,
      mailer: silentMailer,
      jwtSecret: JWT_SECRET,
      otpTtlSeconds: OTP_TTL_SECONDS,
    })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  async function verify(email: string): Promise<Envelope & { statusCode: number }> {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { email, code: '000000' },
    })
    return { statusCode: response.statusCode, ...(response.json() as Envelope) }
  }

  it('throttles /auth/otp/verify per email — the 11th attempt on one address is 429 RATE_LIMITED', async () => {
    const email = uniqueEmail()

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const allowed = await verify(email)
      expect(allowed.statusCode).toBe(401)
    }

    const blocked = await verify(email)

    expect(blocked.statusCode).toBe(429)
    expect(blocked.error?.code).toBe(ERROR_CODES.RATE_LIMITED)
  })

  it('keys that throttle on the email, not the caller — a second address still gets through', async () => {
    const exhausted = uniqueEmail()
    for (let attempt = 0; attempt < 11; attempt += 1) {
      await verify(exhausted)
    }
    expect((await verify(exhausted)).statusCode).toBe(429)

    // Same IP, same app, different address: only the exhausted email is barred.
    const untouched = await verify(uniqueEmail())

    expect(untouched.statusCode).toBe(401)
    expect(untouched.error?.code).toBe(ERROR_CODES.UNAUTHORIZED)
  })

  it('answers the per-IP limiter with a 429 RATE_LIMITED envelope, not a 500 INTERNAL', async () => {
    // 100/minute per IP (routes/auth.ts). Unique addresses keep the per-email
    // limiter out of the way, so the 101st request can only be the IP one.
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const allowed = await verify(uniqueEmail())
      expect(allowed.statusCode).toBe(401)
    }

    const blocked = await verify(uniqueEmail())

    expect(blocked.statusCode).toBe(429)
    expect(blocked.error?.code).toBe(ERROR_CODES.RATE_LIMITED)
  })

  it('documents the 429 response on /auth/otp/verify', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' })
    const document = response.json() as {
      paths: Record<string, { post?: { responses?: Record<string, unknown> } }>
    }

    expect(document.paths['/auth/otp/verify']?.post?.responses).toHaveProperty('429')
  })
})
