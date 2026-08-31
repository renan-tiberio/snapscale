import fastifyRateLimit from '@fastify/rate-limit'
import {
  ERROR_CODES,
  Email,
  HTTP_STATUS,
  OtpCode,
  errorEnvelopeSchema,
  fail,
  ok,
  requestOtpSchema,
  sessionResponseSchema,
  verifyOtpSchema,
} from '@snapscale/shared'
import { z } from 'zod'

import type { Database } from '@/db/index.js'
import type { Mailer } from '@/services/mailer/index.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { OtpServiceError, requestOtp, verifyOtp } from '@/services/otp/index.js'

export type AuthRoutesDeps = {
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

const JWT_EXPIRY = '1h'

/** Generous on purpose: it must never mask the per-email rules below for one legitimate caller. */
const IP_MAX_REQUESTS = 100
const IP_WINDOW = '1 minute'

/**
 * Keyed on the address, so re-requesting a code buys nothing — unlike the per-*code* cap in
 * `services/otp`, which resets with every fresh code. Above the 6 requests a legitimate
 * "5 wrong guesses, then the right one" flow costs.
 */
const VERIFY_MAX_ATTEMPTS_PER_EMAIL = 10
const VERIFY_EMAIL_WINDOW = '10 minutes'

const RATE_LIMITED_MESSAGE = 'Too many requests, please try again later'

/** The `email` of an already-validated `verifyOtpSchema` body, lowercased for a stable key. */
const verifyEmailKey = (request: { readonly body?: unknown }): string => {
  const email = (request.body as { email?: unknown } | undefined)?.email
  return `email:${typeof email === 'string' ? email.toLowerCase() : 'unknown'}`
}

/** A factory, not a bare plugin: only the app composition root owns the db/mailer/ttl. */
export const authRoutes =
  ({ db, mailer, otpTtlSeconds }: AuthRoutesDeps): FastifyPluginAsyncZod =>
  async (fastify) => {
    await fastify.register(fastifyRateLimit, {
      max: IP_MAX_REQUESTS,
      timeWindow: IP_WINDOW,
      // `@fastify/rate-limit` *throws* whatever this returns, so it has to be an `Error`
      // carrying `statusCode`; a bare `fail()` object lands in the handler's 500 fallback.
      errorResponseBuilder: (_request, context) => {
        const error = new Error(RATE_LIMITED_MESSAGE) as Error & { statusCode: number }
        error.statusCode = context.statusCode
        return error
      },
    })

    // `createRateLimit`, not `fastify.rateLimit`: the hook form short-circuits once any
    // limiter has run on the request, and the per-IP one above always has.
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
          await requestOtp({
            db,
            mailer,
            otpTtlSeconds,
            email: new Email(request.body.email),
          })
        } catch (error) {
          if (error instanceof OtpServiceError) {
            reply
              .code(HTTP_STATUS.TOO_MANY_REQUESTS)
              .send(fail({ code: error.code, message: error.message }))
            return
          }
          throw error
        }

        return ok({ data: { requested: true as const } })
      },
    )

    fastify.post(
      '/auth/otp/verify',
      {
        // `isAllowed` is only ever `true` for an allow-list hit; for a real counted request
        // the verdict is `isExceeded`. Runs as a `preHandler` so the body is already parsed.
        preHandler: async (request, reply) => {
          const attempt = await verifyEmailLimiter(request)
          if (!attempt.isAllowed && attempt.isExceeded) {
            await reply
              .code(HTTP_STATUS.TOO_MANY_REQUESTS)
              .send(fail({ code: ERROR_CODES.RATE_LIMITED, message: RATE_LIMITED_MESSAGE }))
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
          const { user } = await verifyOtp({
            db,
            email: new Email(request.body.email),
            code: new OtpCode(request.body.code),
          })
          // `scope: 'session'` is explicit (not merely absent) so the header guard has
          // something concrete to require.
          const token = await fastify.jwt.sign(
            { sub: user.id, email: user.email, scope: 'session' as const },
            { expiresIn: JWT_EXPIRY },
          )

          return ok({
            data: {
              token,
              user: { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() },
            },
          })
        } catch (error) {
          if (error instanceof OtpServiceError) {
            reply
              .code(HTTP_STATUS.UNAUTHORIZED)
              .send(fail({ code: error.code, message: error.message }))
            return
          }
          throw error
        }
      },
    )
  }
