import {
  ERROR_CODES,
  HTTP_STATUS,
  UserId,
  errorEnvelopeSchema,
  fail,
  meResponseSchema,
  ok,
} from '@snapscale/shared'
import { z } from 'zod'

import type { App } from '@/app/index.js'
import type { Database } from '@/db/index.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import * as usersRepo from '@/repositories/users/index.js'

export type MeRoutesDeps = {
  readonly db: Database
  readonly authenticate: NonNullable<App['authenticate']>
}

const meEnvelopeSchema = z.object({
  success: z.boolean(),
  data: meResponseSchema.optional(),
})

const USER_NOT_FOUND_MESSAGE = 'User not found'

/**
 * The row is read back from the database rather than reflected out of the JWT payload: a token
 * is only a claim, so an account deleted mid-session must stop resolving while its 1h token is
 * still cryptographically valid.
 */
export const meRoutes =
  ({ db, authenticate }: MeRoutesDeps): FastifyPluginAsyncZod =>
  async (fastify) => {
    fastify.get(
      '/auth/me',
      {
        preHandler: authenticate,
        schema: {
          description: 'Returns the authenticated user, read back from the database.',
          tags: ['auth'],
          response: { 200: meEnvelopeSchema, 401: errorEnvelopeSchema, 404: errorEnvelopeSchema },
        },
      },
      async (request, reply) => {
        const user = await usersRepo.findById({ db, id: new UserId(request.user.id) })
        if (!user) {
          reply
            .code(HTTP_STATUS.NOT_FOUND)
            .send(fail({ code: ERROR_CODES.NOT_FOUND, message: USER_NOT_FOUND_MESSAGE }))
          return
        }

        return ok({
          data: {
            user: { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() },
          },
        })
      },
    )
  }
