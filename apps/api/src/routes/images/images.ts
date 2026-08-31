import { createReadStream } from 'node:fs'

import {
  AlbumId,
  ERROR_CODES,
  HTTP_STATUS,
  ImageId,
  UserId,
  errorEnvelopeSchema,
  fail,
  imageSchema,
  ok,
} from '@snapscale/shared'
import { z } from 'zod'

import type { App } from '@/app/index.js'
import type { Database } from '@/db/index.js'
import type { Multipart } from '@fastify/multipart'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { entityIdParamsSchema } from '@/routes/schemas/index.js'
import {
  ImageServiceError,
  getImage,
  getImageFile,
  listImagesForAlbum,
  uploadImage,
} from '@/services/images/index.js'
import { FILE_CACHE_CONTROL } from '@/services/storage/index.js'

export type ImageRoutesDeps = {
  readonly db: Database
  readonly uploadDir: string
  readonly authenticate: NonNullable<App['authenticate']>
  /**
   * `GET /images/:id/file` only: an `<img src>` cannot carry an Authorization header, so that
   * one read-only route also accepts `?token=`. Mutating routes keep the header-only guard.
   */
  readonly authenticateAllowingQueryToken: NonNullable<App['authenticateAllowingQueryToken']>
}

const imageResponseSchema = z.object({
  success: z.boolean(),
  data: imageSchema.optional(),
})

const imageListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(imageSchema).optional(),
})

const listImagesQuerySchema = z.object({ albumId: z.string().uuid() })

/**
 * Documentation only. `@fastify/multipart` streams the parts and leaves `request.body` null, so
 * the route neutralizes this validator — validating it against `null` would 400 every upload.
 * The parts are still validated, part by part, in the handler.
 */
const uploadImageBodySchema = z.object({
  file: z.string().describe('The image bytes (jpeg/png/webp, max 10MB).'),
  albumId: z.string().uuid().describe("Id of one of the caller's albums."),
})

const uploadFieldsSchema = z.object({ albumId: z.string().uuid() })

const FILE_TOO_LARGE_CODE = 'FST_REQ_FILE_TOO_LARGE'
const DEFAULT_UPLOAD_FILENAME = 'upload'

type IsFileTooLargeErrorParams = {
  readonly error: unknown
}

const isFileTooLargeError = ({ error }: IsFileTooLargeErrorParams): boolean =>
  error instanceof Error && (error as { code?: string }).code === FILE_TOO_LARGE_CODE

type CollectedUpload = {
  readonly fields: Readonly<Record<string, string>>
  readonly buffer?: Buffer
  readonly mimeType?: string
  readonly originalFilename: string
}

type CollectUploadPartsParams = {
  readonly parts: AsyncIterableIterator<Multipart>
}

/**
 * The whole iteration is one awaited call on purpose: once busboy flags a part as over the
 * limit, resuming for the *next* part rethrows the same error, not just the call that hit it.
 */
const collectUploadParts = async ({
  parts,
}: CollectUploadPartsParams): Promise<CollectedUpload> => {
  let collected: CollectedUpload = { fields: {}, originalFilename: DEFAULT_UPLOAD_FILENAME }

  for await (const part of parts) {
    if (part.type === 'file') {
      collected = {
        ...collected,
        mimeType: part.mimetype,
        originalFilename: part.filename,
        buffer: await part.toBuffer(),
      }
      continue
    }

    collected = {
      ...collected,
      fields: { ...collected.fields, [part.fieldname]: String(part.value) },
    }
  }

  return collected
}

export const imageRoutes =
  ({
    db,
    uploadDir,
    authenticate,
    authenticateAllowingQueryToken,
  }: ImageRoutesDeps): FastifyPluginAsyncZod =>
  async (fastify) => {
    fastify.post(
      '/images',
      {
        preHandler: authenticate,
        // `request.body` is null for a streamed multipart request, so the route opts out of
        // body validation rather than rejecting every upload with a 400.
        validatorCompiler: () => (data: unknown) => ({ value: data }),
        schema: {
          description:
            "Uploads an image (multipart: `file` + `albumId`) into one of the caller's albums.",
          tags: ['images'],
          consumes: ['multipart/form-data'],
          body: uploadImageBodySchema,
          response: {
            200: imageResponseSchema,
            401: errorEnvelopeSchema,
            404: errorEnvelopeSchema,
            422: errorEnvelopeSchema,
          },
        },
      },
      async (request, reply) => {
        const collected = await collectUploadParts({ parts: request.parts() }).catch(
          (error: unknown) => {
            if (isFileTooLargeError({ error })) return undefined
            throw error
          },
        )

        if (!collected) {
          reply.code(HTTP_STATUS.UNPROCESSABLE_ENTITY).send(
            fail({
              code: ERROR_CODES.VALIDATION_ERROR,
              message: 'File exceeds the maximum upload size',
            }),
          )
          return
        }

        const parsedFields = uploadFieldsSchema.safeParse(collected.fields)
        if (!collected.buffer || !parsedFields.success) {
          reply.code(HTTP_STATUS.UNPROCESSABLE_ENTITY).send(
            fail({
              code: ERROR_CODES.VALIDATION_ERROR,
              message: 'Expected a `file` part and a valid `albumId` field',
            }),
          )
          return
        }

        try {
          const image = await uploadImage({
            db,
            uploadDir,
            ownerId: new UserId(request.user.id),
            albumId: new AlbumId(parsedFields.data.albumId),
            originalFilename: collected.originalFilename,
            mimeType: collected.mimeType,
            buffer: collected.buffer,
          })
          return ok({ data: image })
        } catch (error) {
          if (error instanceof ImageServiceError) {
            const status =
              error.code === ERROR_CODES.NOT_FOUND
                ? HTTP_STATUS.NOT_FOUND
                : HTTP_STATUS.UNPROCESSABLE_ENTITY
            reply.code(status).send(fail({ code: error.code, message: error.message }))
            return
          }
          throw error
        }
      },
    )

    fastify.get(
      '/images',
      {
        preHandler: authenticate,
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
          const images = await listImagesForAlbum({
            db,
            albumId: new AlbumId(request.query.albumId),
            ownerId: new UserId(request.user.id),
          })
          return ok({ data: images })
        } catch (error) {
          // `listImagesForAlbum` only ever throws NOT_FOUND.
          if (error instanceof ImageServiceError) {
            reply
              .code(HTTP_STATUS.NOT_FOUND)
              .send(fail({ code: error.code, message: error.message }))
            return
          }
          throw error
        }
      },
    )

    fastify.get(
      '/images/:id',
      {
        preHandler: authenticate,
        schema: {
          description: "Gets one of the caller's images — the entity, not the file bytes.",
          tags: ['images'],
          params: entityIdParamsSchema,
          response: {
            200: imageResponseSchema,
            401: errorEnvelopeSchema,
            404: errorEnvelopeSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const image = await getImage({
            db,
            imageId: new ImageId(request.params.id),
            ownerId: new UserId(request.user.id),
          })
          return ok({ data: image })
        } catch (error) {
          // `getImage` only ever throws NOT_FOUND — a foreign id lands on it too.
          if (error instanceof ImageServiceError) {
            reply
              .code(HTTP_STATUS.NOT_FOUND)
              .send(fail({ code: error.code, message: error.message }))
            return
          }
          throw error
        }
      },
    )

    fastify.get(
      '/images/:id/file',
      {
        preHandler: authenticateAllowingQueryToken,
        schema: {
          description: 'Streams the original image bytes — mine or 404, never an ownership oracle.',
          tags: ['images'],
          params: entityIdParamsSchema,
          // No `response` map: success is a raw binary body, not the JSON envelope.
        },
      },
      async (request, reply) => {
        try {
          const file = await getImageFile({
            db,
            uploadDir,
            imageId: new ImageId(request.params.id),
            ownerId: new UserId(request.user.id),
          })
          reply.header('content-type', file.mimeType)
          reply.header('cache-control', FILE_CACHE_CONTROL)
          reply.header('etag', file.etag)
          if (request.headers['if-none-match'] === file.etag) {
            return reply.code(HTTP_STATUS.NOT_MODIFIED).send()
          }
          // Explicit 200: with no 200 schema declared, the zod provider would otherwise pick
          // one of the declared error schemas for this reply.
          return reply.code(HTTP_STATUS.OK).send(createReadStream(file.absolutePath))
        } catch (error) {
          // `getImageFile` only ever throws NOT_FOUND.
          if (error instanceof ImageServiceError) {
            reply
              .code(HTTP_STATUS.NOT_FOUND)
              .send(fail({ code: error.code, message: error.message }))
            return
          }
          throw error
        }
      },
    )
  }
