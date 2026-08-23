import fastifyRateLimit from '@fastify/rate-limit'
import { ERROR_CODES, fail, ok, requestOtpSchema, sessionResponseSchema, verifyOtpSchema } from '@snapscale/shared'
import { z } from 'zod'

import type { Database } from '@/db/index.js'
import type { Mailer } from '@/services/mailer.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { OtpServiceError, requestOtp, verifyOtp } from '@/services/otp.js'

export interface AuthRoutesDeps {
  readonly db: Database
  readonly mailer: Mailer
  readonly otpTtlSeconds: number
}

const requestOtpResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({ requested: z.literal(true) }).optional(),
})

const verifyOtpResponseSchema = z.object({
  success: z.boolean(),
  data: sessionResponseSchema.optional(),
})

/** Shape of a failure envelope — declared so typed replies can send 401/429 too. */
const errorEnvelopeSchema = z.object({
  success: z.boolean(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
})

const JWT_EXPIRY = '1h'

/**
 * Per-email cap on `/auth/otp/verify` (docs/03 §5.3). The per-*code* cap in
 * `services/otp.ts` is 5 attempts, but it resets with every freshly requested
 * code — an attacker willing to re-request could guess an address forever.
 * This one is keyed on the address itself, so re-requesting buys nothing.
 * Deliberately above the 6 requests a legitimate "5 wrong guesses, then the
 * right one" flow costs.
 */
const VERIFY_MAX_ATTEMPTS_PER_EMAIL = 10
const VERIFY_EMAIL_WINDOW = '10 minutes'

const RATE_LIMITED_MESSAGE = 'Too many requests, please try again later'

/** The `email` of an already-validated `verifyOtpSchema` body, lowercased for a stable key. */
function verifyEmailKey(request: { readonly body?: unknown }): string {
  const email = (request.body as { email?: unknown } | undefined)?.email
  return `email:${typeof email === 'string' ? email.toLowerCase() : 'unknown'}`
}

/**
 * OTP auth surface — `docs/03-technical-design.md` §4/§5. A factory (not a
 * bare plugin) because both routes need the db/mailer/ttl that only the app
 * composition root (`app.ts`) owns.
 */
export function authRoutes(deps: AuthRoutesDeps): FastifyPluginAsyncZod {
  return async (fastify) => {
    // Per-IP throttle for every auth route — the 60s-per-email resend
    // cooldown is the service-level rule (services/otp.ts, §5) and the
    // per-email verify cap is the limiter below. The limit here stays
    // generous so it never masks those rules for a single legitimate caller
    // making several requests/attempts in a row.
    await fastify.register(fastifyRateLimit, {
      max: 100,
      timeWindow: '1 minute',
      // `@fastify/rate-limit` *throws* whatever this returns, so it has to be
      // an `Error` carrying `statusCode`: the app error handler is what turns
      // it into the envelope. Returning a bare `fail()` object here (no
      // `statusCode`, not an `Error`) landed in the handler's 500 fallback,
      // so the per-IP limiter answered 500 INTERNAL instead of 429.
      errorResponseBuilder: (_request, context) => {
        const error = new Error(RATE_LIMITED_MESSAGE) as Error & { statusCode: number }
        error.statusCode = context.statusCode
        return error
      },
    })

    // `createRateLimit` (not `fastify.rateLimit`) on purpose: the hook form
    // short-circuits when *any* limiter already ran on the request, and the
    // per-IP one above always has. This form is a plain counter call, so both
    // keys are enforced — and running it as a `preHandler` is what makes
    // `request.body.email` available (and already schema-validated) to key on.
    const verifyEmailLimiter = fastify.createRateLimit({
      max: VERIFY_MAX_ATTEMPTS_PER_EMAIL,
      timeWindow: VERIFY_EMAIL_WINDOW,
      keyGenerator: verifyEmailKey,
    })

    fastify.post(
      '/auth/otp/request',
      {
        schema: {
          description:
            'Requests a one-time code by email. Always 200 — never reveals whether the email exists.',
          tags: ['auth'],
          body: requestOtpSchema,
          response: { 200: requestOtpResponseSchema, 429: errorEnvelopeSchema },
        },
      },
      async (request, reply) => {
        try {
          await requestOtp(
            { db: deps.db, mailer: deps.mailer, otpTtlSeconds: deps.otpTtlSeconds },
            request.body.email,
          )
        } catch (error) {
          if (error instanceof OtpServiceError) {
            reply.code(429).send(fail(error.code, error.message))
            return
          }
          throw error
        }

        return ok({ requested: true as const })
      },
    )

    fastify.post(
      '/auth/otp/verify',
      {
        // `isAllowed` is only ever `true` for an allow-list hit; for a real
        // counted request the verdict is `isExceeded`.
        preHandler: async (request, reply) => {
          const attempt = await verifyEmailLimiter(request)
          if (!attempt.isAllowed && attempt.isExceeded) {
            await reply.code(429).send(fail(ERROR_CODES.RATE_LIMITED, RATE_LIMITED_MESSAGE))
          }
        },
        schema: {
          description: 'Exchanges a 6-digit code for a session.',
          tags: ['auth'],
          body: verifyOtpSchema,
          response: {
            200: verifyOtpResponseSchema,
            401: errorEnvelopeSchema,
            429: errorEnvelopeSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const { user } = await verifyOtp({ db: deps.db }, request.body.email, request.body.code)
          // `scope: 'session'` is explicit (not just "no scope") so the
          // header guard's scope check in `plugins/auth-guard.ts` has
          // something concrete to require — see docs/03 §4.
          const token = await fastify.jwt.sign(
            { sub: user.id, email: user.email, scope: 'session' as const },
            { expiresIn: JWT_EXPIRY },
          )

          return ok({
            token,
            user: { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() },
          })
        } catch (error) {
          if (error instanceof OtpServiceError) {
            reply.code(401).send(fail(error.code, error.message))
            return
          }
          throw error
        }
      },
    )
  }
}
