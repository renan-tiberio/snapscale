import { createReadStream } from 'node:fs'

import { ERROR_CODES, fail, imageSchema, ok } from '@snapscale/shared'
import { z } from 'zod'

import type { App } from '@/app.js'
import type { Database } from '@/db/index.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { ImageServiceError, getImageFile, listImagesForAlbum, uploadImage } from '@/services/images.js'

export interface ImageRoutesDeps {
  readonly db: Database
  readonly uploadDir: string
  readonly authenticate: NonNullable<App['authenticate']>
  /**
   * Used only by `GET /images/:id/file`: browsers cannot attach an
   * Authorization header to an `<img src>`, so that one read-only route also
   * accepts `?token=` (docs/03 §4). Mutating routes keep the header-only guard.
   */
  readonly authenticateAllowingQueryToken: NonNullable<App['authenticateAllowingQueryToken']>
}

const errorEnvelopeSchema = z.object({
  success: z.boolean(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
})

const imageResponseSchema = z.object({
  success: z.boolean(),
  data: imageSchema.optional(),
})

const imageListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(imageSchema).optional(),
})

const listImagesQuerySchema = z.object({ albumId: z.string().uuid() })
const imageIdParamsSchema = z.object({ id: z.string().uuid() })

const FILE_TOO_LARGE_CODE = 'FST_REQ_FILE_TOO_LARGE'

function isFileTooLargeError(error: unknown): boolean {
  return error instanceof Error && (error as { code?: string }).code === FILE_TOO_LARGE_CODE
}

/**
 * `POST /images`, `GET /images?albumId=`, `GET /images/:id/file` (docs/03
 * §4/§7). Every route sits behind `deps.authenticate`.
 */
export function imageRoutes(deps: ImageRoutesDeps): FastifyPluginAsyncZod {
  return async (fastify) => {
    fastify.post(
      '/images',
      {
        preHandler: deps.authenticate,
        schema: {
          description: 'Uploads an image (multipart: `file` + `albumId`) into one of the caller\'s albums.',
          tags: ['images'],
          consumes: ['multipart/form-data'],
          response: {
            200: imageResponseSchema,
            401: errorEnvelopeSchema,
            404: errorEnvelopeSchema,
            422: errorEnvelopeSchema,
          },
        },
      },
      async (request, reply) => {
        const fields: Record<string, string> = {}
        let fileBuffer: Buffer | undefined
        let mimeType: string | undefined
        let originalFilename = 'upload'
        let fileTooLarge = false

        try {
          // The whole loop — not just `toBuffer()` — has to sit inside this
          // try: once busboy flags a part as over the limit, resuming the
          // `for await` to fetch the *next* part rethrows the same error
          // (the underlying stream is already dead), not just the call that
          // triggered it.
          for await (const part of request.parts()) {
            if (part.type === 'file') {
              mimeType = part.mimetype
              originalFilename = part.filename
              fileBuffer = await part.toBuffer()
            } else {
              fields[part.fieldname] = String(part.value)
            }
          }
        } catch (error) {
          if (isFileTooLargeError(error)) {
            fileTooLarge = true
          } else {
            throw error
          }
        }

        if (fileTooLarge) {
          reply.code(422).send(fail(ERROR_CODES.VALIDATION_ERROR, 'File exceeds the maximum upload size'))
          return
        }

        const parsedFields = z.object({ albumId: z.string().uuid() }).safeParse(fields)
        if (!fileBuffer || !parsedFields.success) {
          reply
            .code(422)
            .send(fail(ERROR_CODES.VALIDATION_ERROR, 'Expected a `file` part and a valid `albumId` field'))
          return
        }

        try {
          const image = await uploadImage(
            { db: deps.db, uploadDir: deps.uploadDir },
            {
              ownerId: request.user.id,
              albumId: parsedFields.data.albumId,
              originalFilename,
              mimeType,
              buffer: fileBuffer,
            },
          )
          return ok(image)
        } catch (error) {
          if (error instanceof ImageServiceError) {
            if (error.code === ERROR_CODES.NOT_FOUND) {
              reply.code(404).send(fail(error.code, error.message))
            } else {
              reply.code(422).send(fail(error.code, error.message))
            }
            return
          }
          throw error
        }
      },
    )

    fastify.get(
      '/images',
      {
        preHandler: deps.authenticate,
        schema: {
          description: "Lists an album's images — the album must belong to the caller.",
          tags: ['images'],
          querystring: listImagesQuerySchema,
          response: {
            200: imageListResponseSchema,
            401: errorEnvelopeSchema,
            404: errorEnvelopeSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const images = await listImagesForAlbum(
            { db: deps.db, uploadDir: deps.uploadDir },
            request.query.albumId,
            request.user.id,
          )
          return ok(images)
        } catch (error) {
          // `listImagesForAlbum` only ever throws NOT_FOUND — 404 is the
          // only mapping this route needs.
          if (error instanceof ImageServiceError) {
            reply.code(404).send(fail(error.code, error.message))
            return
          }
          throw error
        }
      },
    )

    fastify.get(
      '/images/:id/file',
      {
        preHandler: deps.authenticateAllowingQueryToken,
        schema: {
          description: 'Streams the original image bytes — mine or 404, never an ownership oracle.',
          tags: ['images'],
          params: imageIdParamsSchema,
          // No `response` map: success is a raw binary body (not the JSON
          // envelope), so there is nothing useful to validate/serialize
          // against a zod schema for 200 — only the error paths are typed
          // JSON, and those still go through `fail()` below untyped by
          // this route's schema.
        },
      },
      async (request, reply) => {
        try {
          const file = await getImageFile(
            { db: deps.db, uploadDir: deps.uploadDir },
            request.params.id,
            request.user.id,
          )
          reply.header('content-type', file.mimeType)
          // No response schema is declared for 200 (binary body, not an
          // envelope) — the explicit `code(200)` keeps the zod type
          // provider from picking one of the declared error schemas for
          // this reply.
          return reply.code(200).send(createReadStream(file.absolutePath))
        } catch (error) {
          // `getImageFile` only ever throws NOT_FOUND — 404 is the only
          // mapping this route needs.
          if (error instanceof ImageServiceError) {
            reply.code(404).send(fail(error.code, error.message))
            return
          }
          throw error
        }
      },
    )
  }
}
