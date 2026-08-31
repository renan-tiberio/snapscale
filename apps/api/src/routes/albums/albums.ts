import {
  AlbumId,
  ERROR_CODES,
  HTTP_STATUS,
  UserId,
  albumSchema,
  createAlbumSchema,
  errorEnvelopeSchema,
  fail,
  listAlbumsQuerySchema,
  ok,
  updateAlbumSchema,
} from '@snapscale/shared'
import { z } from 'zod'

import type { App } from '@/app/index.js'
import type { Database } from '@/db/index.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { entityIdParamsSchema } from '@/routes/schemas/index.js'
import * as albumsService from '@/services/albums/index.js'

export type AlbumRoutesDeps = {
  readonly db: Database
  readonly authenticate: NonNullable<App['authenticate']>
}

const albumResponseSchema = z.object({
  success: z.boolean(),
  data: albumSchema.optional(),
})

/**
 * `meta` is declared here on purpose: the zod serializer strips whatever the response
 * schema does not mention, so the pagination block would silently vanish from the wire.
 */
const albumListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(albumSchema).optional(),
  meta: z
    .object({
      total: z.number().int().nonnegative(),
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
    })
    .optional(),
})

const emptyResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({}).optional(),
})

/**
 * Ownership lives in the repository query, so "not mine" and "doesn't exist" are the same
 * 404 — the routes are never an ownership oracle.
 */
export const albumRoutes = ({ db, authenticate }: AlbumRoutesDeps): FastifyPluginAsyncZod => {
  const notFound = () =>
    fail({ code: ERROR_CODES.NOT_FOUND, message: albumsService.ALBUM_NOT_FOUND_MESSAGE })

  return async (fastify) => {
    fastify.get(
      '/albums',
      {
        preHandler: authenticate,
        schema: {
          description: "Lists the authenticated user's albums, newest first.",
          tags: ['albums'],
          querystring: listAlbumsQuerySchema,
          response: {
            200: albumListResponseSchema,
            401: errorEnvelopeSchema,
            422: errorEnvelopeSchema,
          },
        },
      },
      async (request) => {
        const page = await albumsService.listAlbums({
          db,
          ownerId: new UserId(request.user.id),
          pagination: request.query,
        })
        return ok({ data: page.albums, meta: page.meta })
      },
    )

    fastify.post(
      '/albums',
      {
        preHandler: authenticate,
        schema: {
          description: 'Creates an album owned by the authenticated user.',
          tags: ['albums'],
          body: createAlbumSchema,
          response: {
            200: albumResponseSchema,
            401: errorEnvelopeSchema,
            422: errorEnvelopeSchema,
          },
        },
      },
      async (request) =>
        ok({
          data: await albumsService.createAlbum({
            db,
            ownerId: new UserId(request.user.id),
            name: request.body.name,
            description: request.body.description,
          }),
        }),
    )

    fastify.get(
      '/albums/:id',
      {
        preHandler: authenticate,
        schema: {
          description: "Gets one of the authenticated user's albums by id.",
          tags: ['albums'],
          params: entityIdParamsSchema,
          response: {
            200: albumResponseSchema,
            401: errorEnvelopeSchema,
            404: errorEnvelopeSchema,
          },
        },
      },
      async (request, reply) => {
        const album = await albumsService.getAlbum({
          db,
          id: new AlbumId(request.params.id),
          ownerId: new UserId(request.user.id),
        })
        if (!album) {
          reply.code(HTTP_STATUS.NOT_FOUND).send(notFound())
          return
        }
        return ok({ data: album })
      },
    )

    fastify.patch(
      '/albums/:id',
      {
        preHandler: authenticate,
        schema: {
          description: "Partially updates one of the authenticated user's albums.",
          tags: ['albums'],
          params: entityIdParamsSchema,
          body: updateAlbumSchema,
          response: {
            200: albumResponseSchema,
            401: errorEnvelopeSchema,
            404: errorEnvelopeSchema,
            422: errorEnvelopeSchema,
          },
        },
      },
      async (request, reply) => {
        const album = await albumsService.updateAlbum({
          db,
          id: new AlbumId(request.params.id),
          ownerId: new UserId(request.user.id),
          patch: request.body,
        })
        if (!album) {
          reply.code(HTTP_STATUS.NOT_FOUND).send(notFound())
          return
        }
        return ok({ data: album })
      },
    )

    fastify.delete(
      '/albums/:id',
      {
        preHandler: authenticate,
        schema: {
          description: "Deletes one of the authenticated user's albums.",
          tags: ['albums'],
          params: entityIdParamsSchema,
          response: {
            200: emptyResponseSchema,
            401: errorEnvelopeSchema,
            404: errorEnvelopeSchema,
          },
        },
      },
      async (request, reply) => {
        const removed = await albumsService.removeAlbum({
          db,
          id: new AlbumId(request.params.id),
          ownerId: new UserId(request.user.id),
        })
        if (!removed) {
          reply.code(HTTP_STATUS.NOT_FOUND).send(notFound())
          return
        }
        return ok({ data: {} })
      },
    )
  }
}
