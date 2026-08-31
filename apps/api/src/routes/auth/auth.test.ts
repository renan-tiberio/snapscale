import { randomUUID } from 'node:crypto'

import { ERROR_CODES } from '@snapscale/shared'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { App } from '@/app/index.js'
import type { Mailer } from '@/services/mailer/index.js'

import { buildApp } from '@/app/index.js'
import { createMailer } from '@/services/mailer/index.js'
import { createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'
import { connectToMailhog, waitForMessagesTo, type TestMailhog } from '~/test/mailhog.js'

const JWT_SECRET = 'test-jwt-secret-do-not-use-in-prod'
const OTP_TTL_SECONDS = 600 // 10 minutes

/** The rate-limit suite below drives `/auth/otp/verify`, which never sends mail. */
const silentMailer: Mailer = { sendMail: async () => undefined }

type Envelope<T> = {
  readonly success: boolean
  readonly data?: T
  readonly error?: { readonly code: string; readonly message: string }
}

const uniqueEmail = (): string => `user-${randomUUID()}@example.com`

const extractCode = ({ subject }: { subject: string }): string => {
  const match = subject.match(/\d{6}/)

  if (!match) {
    throw new Error(`no 6-digit code found in subject: ${subject}`)
  }

  return match[0]
}

const first = <T>({ items }: { items: readonly T[] }): T => {
  const item = items[0]

  if (item === undefined) {
    throw new Error('expected at least one item')
  }

  return item
}

describe('auth routes (/auth/otp/*)', () => {
  let database: TestDatabase
  let mailhog: TestMailhog
  let app: App

  beforeAll(async () => {
    database = await createTestDatabase()
    // Connects to the run's already-started MailHog container — synchronous, so there is no
    // container startup here to race against sibling test files.
    mailhog = connectToMailhog()

    app = await buildApp({
      logger: false,
      db: database.db,
      mailer: createMailer({ SMTP_HOST: mailhog.smtpHost, SMTP_PORT: mailhog.smtpPort }),
      jwtSecret: JWT_SECRET,
      otpTtlSeconds: OTP_TTL_SECONDS,
    })
    await app.ready()
  }, 60_000)

  afterAll(async () => {
    // Guarded: a `beforeAll` failure leaves these unassigned, and an unconditional teardown
    // would throw here and bury the real startup error.
    if (app) {
      await app.close()
    }
    if (database) {
      await database.destroy()
    }
  })

  beforeEach(async () => {
    await truncateAll({ handle: database })
    await mailhog.purge()
  })

  const requestOtpCode = async ({ email }: { email: string }): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { email },
    })
    expect(response.statusCode).toBe(200)

    const messages = await waitForMessagesTo({ mailhog, email })
    expect(messages.length).toBeGreaterThan(0)

    return extractCode({ subject: first({ items: messages }).subject })
  }

  it('responds 200 with the ok envelope and never reveals whether the email exists', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { email: uniqueEmail() },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ success: true, data: { requested: true } })
  })

  it('physically delivers the code via MailHog to the requested address, in the subject and body', async () => {
    const email = uniqueEmail()

    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { email },
    })
    expect(response.statusCode).toBe(200)

    const messages = await waitForMessagesTo({ mailhog, email })

    expect(messages).toHaveLength(1)
    const message = first({ items: messages })
    expect(message.to).toContain(email)
    const code = extractCode({ subject: message.subject })
    expect(code).toMatch(/^\d{6}$/)
    expect(message.body).toContain(code)
  })

  it('exchanges the emailed code for a token whose payload decodes to the requesting user', async () => {
    const email = uniqueEmail()
    const code = await requestOtpCode({ email })

    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { email, code },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as Envelope<{ token: string; user: { id: string; email: string } }>
    expect(body.success).toBe(true)
    expect(body.data?.user.email).toBe(email)

    const payload = app.jwt.verify(body.data?.token ?? '') as { sub: string; email: string }
    expect(payload.sub).toBe(body.data?.user.id)
    expect(payload.email).toBe(email)
  })

  it('issues a session token that expires exactly 1 hour after it was issued (docs/03 §5)', async () => {
    const email = uniqueEmail()
    const code = await requestOtpCode({ email })

    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { email, code },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as Envelope<{ token: string }>

    const payload = app.jwt.verify(body.data?.token ?? '') as { exp: number; iat: number }
    expect(payload.exp - payload.iat).toBe(3600)
  })

  it('rejects a second use of the same code with a 401 UNAUTHORIZED envelope', async () => {
    const email = uniqueEmail()
    const code = await requestOtpCode({ email })

    const first = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { email, code },
    })
    expect(first.statusCode).toBe(200)

    const second = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { email, code },
    })

    expect(second.statusCode).toBe(401)
    expect(second.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.UNAUTHORIZED },
    })
  })

  it('rejects an expired code with a 401 UNAUTHORIZED envelope', async () => {
    const email = uniqueEmail()
    const code = await requestOtpCode({ email })

    await database.pool.query(
      `update otp_codes set expires_at = now() - interval '1 minute' where email = $1`,
      [email],
    )

    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { email, code },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.UNAUTHORIZED },
    })
  })

  it('keeps the code usable through exactly 4 wrong attempts, so the right code still 200s', async () => {
    const email = uniqueEmail()
    const code = await requestOtpCode({ email })
    const wrongCode = code === '000000' ? '111111' : '000000'

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/otp/verify',
        payload: { email, code: wrongCode },
      })
      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({
        success: false,
        error: { code: ERROR_CODES.UNAUTHORIZED },
      })
    }

    const finalAttempt = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { email, code },
    })

    expect(finalAttempt.statusCode).toBe(200)
    const body = finalAttempt.json() as Envelope<{ user: { email: string } }>
    expect(body.data?.user.email).toBe(email)
  })

  it('invalidates the code after exactly 5 wrong attempts, so even the right code then 401s', async () => {
    const email = uniqueEmail()
    const code = await requestOtpCode({ email })
    const wrongCode = code === '000000' ? '111111' : '000000'

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/otp/verify',
        payload: { email, code: wrongCode },
      })
      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({
        success: false,
        error: { code: ERROR_CODES.UNAUTHORIZED },
      })
    }

    const finalAttempt = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { email, code },
    })

    expect(finalAttempt.statusCode).toBe(401)
    expect(finalAttempt.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.UNAUTHORIZED },
    })
  })

  it('rejects a resend inside the 60s cooldown with a 429 RATE_LIMITED envelope', async () => {
    const email = uniqueEmail()

    const first = await app.inject({ method: 'POST', url: '/auth/otp/request', payload: { email } })
    expect(first.statusCode).toBe(200)

    const second = await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { email },
    })

    expect(second.statusCode).toBe(429)
    expect(second.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.RATE_LIMITED },
    })
  })

  it('rejects a malformed email on /auth/otp/request with 422 VALIDATION_ERROR naming the field', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { email: 'not-an-email' },
    })

    expect(response.statusCode).toBe(422)
    const body = response.json() as Envelope<never>
    expect(body.error?.code).toBe(ERROR_CODES.VALIDATION_ERROR)
    expect(body.error?.message).toMatch(/email/i)
  })

  it('rejects a malformed code on /auth/otp/verify with 422 VALIDATION_ERROR naming the field', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { email: uniqueEmail(), code: '12' },
    })

    expect(response.statusCode).toBe(422)
    const body = response.json() as Envelope<never>
    expect(body.error?.code).toBe(ERROR_CODES.VALIDATION_ERROR)
    expect(body.error?.message).toMatch(/code/i)
  })

  it('documents both routes at /docs/json', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' })
    const document = response.json() as { paths: Record<string, unknown> }

    expect(document.paths).toHaveProperty('/auth/otp/request')
    expect(document.paths).toHaveProperty('/auth/otp/verify')
  })
})

/**
 * Every test here builds its own app: the rate-limit store lives on the instance, so a shared
 * one would leak counters between tests and into the suite above.
 */
describe('auth rate limiting (per-IP AND per-email)', () => {
  let database: TestDatabase
  let app: App

  beforeAll(async () => {
    database = await createTestDatabase()
  }, 60_000)

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    await truncateAll({ handle: database })
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

  const verify = async ({
    email,
  }: {
    email: string
  }): Promise<Envelope<never> & { statusCode: number }> => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { email, code: '000000' },
    })
    return { statusCode: response.statusCode, ...(response.json() as Envelope<never>) }
  }

  it('throttles /auth/otp/verify per email — the 11th attempt on one address is 429 RATE_LIMITED', async () => {
    const email = uniqueEmail()

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const allowed = await verify({ email })
      expect(allowed.statusCode).toBe(401)
    }

    const blocked = await verify({ email })

    expect(blocked.statusCode).toBe(429)
    expect(blocked.error?.code).toBe(ERROR_CODES.RATE_LIMITED)
  })

  it('keys that throttle on the email, not the caller — a second address still gets through', async () => {
    const exhausted = uniqueEmail()
    for (let attempt = 0; attempt < 11; attempt += 1) {
      await verify({ email: exhausted })
    }
    expect((await verify({ email: exhausted })).statusCode).toBe(429)

    // Same IP, same app, different address: only the exhausted email is barred.
    const untouched = await verify({ email: uniqueEmail() })

    expect(untouched.statusCode).toBe(401)
    expect(untouched.error?.code).toBe(ERROR_CODES.UNAUTHORIZED)
  })

  it('answers the per-IP limiter with a 429 RATE_LIMITED envelope, not a 500 INTERNAL', async () => {
    // Unique addresses keep the per-email limiter out of the way, so the 101st request
    // can only have been stopped by the per-IP one.
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const allowed = await verify({ email: uniqueEmail() })
      expect(allowed.statusCode).toBe(401)
    }

    const blocked = await verify({ email: uniqueEmail() })

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
