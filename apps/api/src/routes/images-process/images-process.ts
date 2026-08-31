import {
  ERROR_CODES,
  HTTP_STATUS,
  ImageId,
  UserId,
  errorEnvelopeSchema,
  fail,
  ok,
  processImageParamsSchema,
  processedImageSchema,
} from '@snapscale/shared'
import { z } from 'zod'

import type { App } from '@/app/index.js'
import type { Database } from '@/db/index.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { processImage } from '@/services/image-processing/index.js'
import { ImageServiceError } from '@/services/images/index.js'

export type ImageProcessRoutesDeps = {
  readonly db: Database
  readonly uploadDir: string
  readonly authenticate: NonNullable<App['authenticate']>
}

const processedImageResponseSchema = z.object({
  success: z.boolean(),
  data: processedImageSchema.optional(),
})

/**
 * Its own module rather than part of `routes/images` because a later phase extracts exactly
 * this handler into its own service: that move should be a file move plus a contract import.
 */
export const imageProcessRoutes =
  ({ db, uploadDir, authenticate }: ImageProcessRoutesDeps): FastifyPluginAsyncZod =>
  async (fastify) => {
    fastify.post(
      '/images/process',
      {
        preHandler: authenticate,
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
          const processed = await processImage({
            db,
            uploadDir,
            imageId: new ImageId(request.body.imageId),
            ownerId: new UserId(request.user.id),
            width: request.body.width,
            height: request.body.height,
            filter: request.body.filter,
            quality: request.body.quality,
          })
          return ok({ data: processed })
        } catch (error) {
          // `processImage` only ever throws NOT_FOUND — an unknown image and one belonging to
          // someone else answer the same way, so the route is never an ownership oracle.
          if (error instanceof ImageServiceError) {
            reply
              .code(HTTP_STATUS.NOT_FOUND)
              .send(fail({ code: ERROR_CODES.NOT_FOUND, message: error.message }))
            return
          }
          throw error
        }
      },
    )
  }
