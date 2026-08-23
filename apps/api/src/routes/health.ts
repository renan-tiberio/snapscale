import { ok } from '@snapscale/shared'
import { z } from 'zod'

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { getHealthStatus } from '@/services/health.js'

const healthResponseSchema = z.object({
  // `ApiResponse.success` is typed `boolean` (the envelope is shared across
  // success and failure paths) — the /health route always returns `true`
  // at runtime, asserted by the app.test.ts behavioral test.
  success: z.boolean(),
  // Optional to structurally match `ApiResponse<T>.data?: T` from
  // @snapscale/shared — this route always sends it, asserted in app.test.ts.
  data: z.object({ status: z.literal('ok') }).optional(),
})

/** Liveness probe. Thin handler — all behavior lives in `services/health.ts`. */
export const healthRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/health',
    {
      schema: {
        description: 'Liveness probe for the api service.',
        tags: ['health'],
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async () => ok(getHealthStatus()),
  )
}
