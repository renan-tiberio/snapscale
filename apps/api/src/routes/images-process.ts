import { ERROR_CODES, fail, ok, processImageParamsSchema, processedImageSchema } from '@snapscale/shared'
import { z } from 'zod'

import type { App } from '@/app.js'
import type { Database } from '@/db/index.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { processImage } from '@/services/image-processing.js'
import { ImageServiceError } from '@/services/images.js'

export interface ImageProcessRoutesDeps {
  readonly db: Database
  readonly uploadDir: string
  readonly authenticate: NonNullable<App['authenticate']>
}

const errorEnvelopeSchema = z.object({
  success: z.boolean(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
})

const processedImageResponseSchema = z.object({
  success: z.boolean(),
  data: processedImageSchema.optional(),
})

/**
 * `POST /images/process` (docs/03 §4) — the deliberately heavy route.
 *
 * Kept in its own module rather than folded into `images.ts` because phase 3
 * extracts exactly this handler into `apps/image-processor`: the move should
 * be a file move plus a contract import, nothing else (docs/02 §2).
 */
export function imageProcessRoutes(deps: ImageProcessRoutesDeps): FastifyPluginAsyncZod {
  return async (fastify) => {
    fastify.post(
      '/images/process',
      {
        preHandler: deps.authenticate,
        schema: {
          description:
            "Resizes and filters one of the caller's images with sharp. Synchronous on purpose — this is the route later phases extract and scale.",
          tags: ['images'],
          body: processImageParamsSchema,
          response: {
            200: processedImageResponseSchema,
            401: errorEnvelopeSchema,
            404: errorEnvelopeSchema,
            422: errorEnvelopeSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const processed = await processImage(
            { db: deps.db, uploadDir: deps.uploadDir },
            {
              imageId: request.body.imageId,
              ownerId: request.user.id,
              width: request.body.width,
              height: request.body.height,
              filter: request.body.filter,
              quality: request.body.quality,
            },
          )
          return ok(processed)
        } catch (error) {
          // `processImage` only ever throws NOT_FOUND (unknown image, or an
          // image belonging to someone else — the same answer either way, so
          // the route is never an ownership oracle).
          if (error instanceof ImageServiceError) {
            reply.code(404).send(fail(ERROR_CODES.NOT_FOUND, error.message))
            return
          }
          throw error
        }
      },
    )
  }
}
