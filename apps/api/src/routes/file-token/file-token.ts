import { fileTokenResponseSchema, ok } from '@snapscale/shared'
import { z } from 'zod'

import type { App } from '@/app/index.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export type FileTokenRoutesDeps = {
  readonly authenticate: NonNullable<App['authenticate']>
}

const fileTokenEnvelopeSchema = z.object({
  success: z.boolean(),
  data: fileTokenResponseSchema.optional(),
})

/** Long enough for a page of `<img>` tags to load, short enough that a leaked URL is worthless. */
const FILE_TOKEN_TTL_SECONDS = 60 // 1 minute

/**
 * Exchanges a session (header only, `session` scope) for a short-lived `file`-scope token.
 * Accepted on no other route, and it never carries `email` — only `sub` and `scope`.
 */
export const fileTokenRoutes =
  ({ authenticate }: FileTokenRoutesDeps): FastifyPluginAsyncZod =>
  async (fastify) => {
    fastify.get(
      '/auth/file-token',
      {
        preHandler: authenticate,
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
        return ok({ data: { token } })
      },
    )
  }
