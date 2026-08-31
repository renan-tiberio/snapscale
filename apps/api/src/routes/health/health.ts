import { ok } from '@snapscale/shared'
import { z } from 'zod'

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { getHealthStatus } from '@/services/health/index.js'

/**
 * `success`/`data` stay loose here to match `ApiResponse<T>` structurally; the route always
 * sends `true` and the payload, asserted behaviorally in `app/app.test.ts`.
 */
const healthResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({ status: z.literal('ok') }).optional(),
})

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
    async () => ok({ data: getHealthStatus() }),
  )
}
