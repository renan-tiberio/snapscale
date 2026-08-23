import { ERROR_CODES, fail, meResponseSchema, ok } from '@snapscale/shared'
import { z } from 'zod'

import type { App } from '@/app.js'
import type { Database } from '@/db/index.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import * as usersRepo from '@/repositories/users.js'

export interface MeRoutesDeps {
  readonly db: Database
  readonly authenticate: NonNullable<App['authenticate']>
}

const errorEnvelopeSchema = z.object({
  success: z.boolean(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
})

const meEnvelopeSchema = z.object({
  success: z.boolean(),
  data: meResponseSchema.optional(),
})

/**
 * `GET /auth/me` (docs/03 §4) — the server-side answer to "is this token
 * still good, and who does it belong to?". The row is read back from the
 * database rather than reflected out of the JWT payload: a token is only a
 * claim, and an account deleted mid-session must stop resolving (404) even
 * while its 1h token is still cryptographically valid.
 */
export function meRoutes(deps: MeRoutesDeps): FastifyPluginAsyncZod {
  return async (fastify) => {
    fastify.get(
      '/auth/me',
      {
        preHandler: deps.authenticate,
        schema: {
          description: 'Returns the authenticated user, read back from the database.',
          tags: ['auth'],
          response: { 200: meEnvelopeSchema, 401: errorEnvelopeSchema, 404: errorEnvelopeSchema },
        },
      },
      async (request, reply) => {
        const user = await usersRepo.findById(deps.db, request.user.id)
        if (!user) {
          reply.code(404).send(fail(ERROR_CODES.NOT_FOUND, 'User not found'))
          return
        }

        return ok({
          user: { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() },
        })
      },
    )
  }
}
