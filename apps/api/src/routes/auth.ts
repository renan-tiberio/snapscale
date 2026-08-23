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
 * OTP auth surface — `docs/03-technical-design.md` §4/§5. A factory (not a
 * bare plugin) because both routes need the db/mailer/ttl that only the app
 * composition root (`app.ts`) owns.
 */
export function authRoutes(deps: AuthRoutesDeps): FastifyPluginAsyncZod {
  return async (fastify) => {
    // Per-IP throttle only — the 60s-per-email resend cooldown is the
    // service-level rule (services/otp.ts, §5). The limit here stays
    // generous so it never masks that rule for a single legitimate caller
    // making several requests/attempts in a row.
    await fastify.register(fastifyRateLimit, {
      max: 100,
      timeWindow: '1 minute',
      errorResponseBuilder: () =>
        fail(ERROR_CODES.RATE_LIMITED, 'Too many requests, please try again later'),
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
        schema: {
          description: 'Exchanges a 6-digit code for a session.',
          tags: ['auth'],
          body: verifyOtpSchema,
          response: { 200: verifyOtpResponseSchema, 401: errorEnvelopeSchema },
        },
      },
      async (request, reply) => {
        try {
          const { user } = await verifyOtp({ db: deps.db }, request.body.email, request.body.code)
          const token = await fastify.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: JWT_EXPIRY })

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
