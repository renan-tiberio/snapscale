import { fileTokenResponseSchema, ok } from '@snapscale/shared'
import { z } from 'zod'

import type { App } from '@/app.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface FileTokenRoutesDeps {
  readonly authenticate: NonNullable<App['authenticate']>
}

const fileTokenEnvelopeSchema = z.object({
  success: z.boolean(),
  data: fileTokenResponseSchema.optional(),
})

/**
 * 60s (docs/03 §4, review finding fixed by this file): long enough for a
 * page of `<img>` tags to load, short enough that a leaked image URL is
 * worthless within a minute — unlike the 1h session token it replaces on
 * these routes.
 */
const FILE_TOKEN_TTL_SECONDS = 60

/**
 * `GET /auth/file-token` — exchanges a valid session (header only, `session`
 * scope) for a short-lived `file`-scope token meant only for `?token=` /
 * `<img src>` use on the file-serving GET routes (`GET /files/*`, `GET
 * /images/:id/file`). Never accepted on any other route, and never carries
 * `email` — only `sub` and `scope`.
 */
export function fileTokenRoutes(deps: FileTokenRoutesDeps): FastifyPluginAsyncZod {
  return async (fastify) => {
    fastify.get(
      '/auth/file-token',
      {
        preHandler: deps.authenticate,
        schema: {
          description:
            'Issues a 60s `scope: "file"` token for `?token=` / `<img src>` use on file-serving GET routes. Requires a session (header) Authorization.',
          tags: ['auth'],
          response: { 200: fileTokenEnvelopeSchema },
        },
      },
      async (request) => {
        const token = await fastify.jwt.sign(
          { sub: request.user.id, scope: 'file' as const },
          { expiresIn: `${FILE_TOKEN_TTL_SECONDS}s` },
        )
        return ok({ token })
      },
    )
  }
}
