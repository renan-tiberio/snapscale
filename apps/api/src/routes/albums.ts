import { ERROR_CODES, albumSchema, createAlbumSchema, fail, ok, updateAlbumSchema } from '@snapscale/shared'
import { z } from 'zod'

import type { App } from '@/app.js'
import type { Database } from '@/db/index.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import * as albumsService from '@/services/albums.js'

export interface AlbumRoutesDeps {
  readonly db: Database
  readonly authenticate: NonNullable<App['authenticate']>
}

const errorEnvelopeSchema = z.object({
  success: z.boolean(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
})

const albumResponseSchema = z.object({
  success: z.boolean(),
  data: albumSchema.optional(),
})

const albumListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(albumSchema).optional(),
})

const emptyResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({}).optional(),
})

const albumIdParamsSchema = z.object({ id: z.string().uuid() })

/**
 * `GET/POST /albums`, `GET/PATCH/DELETE /albums/:id` (docs/03 §4). Every
 * route sits behind `deps.authenticate` and scopes by `request.user.id` —
 * ownership lives in the repository query, so "not mine" and "doesn't
 * exist" are the same 404, never an oracle.
 */
export function albumRoutes(deps: AlbumRoutesDeps): FastifyPluginAsyncZod {
  return async (fastify) => {
    fastify.get(
      '/albums',
      {
        preHandler: deps.authenticate,
        schema: {
          description: "Lists the authenticated user's albums.",
          tags: ['albums'],
          response: { 200: albumListResponseSchema, 401: errorEnvelopeSchema },
        },
      },
      async (request) => ok(await albumsService.listAlbums(deps.db, request.user.id)),
    )

    fastify.post(
      '/albums',
      {
        preHandler: deps.authenticate,
        schema: {
          description: 'Creates an album owned by the authenticated user.',
          tags: ['albums'],
          body: createAlbumSchema,
          response: { 200: albumResponseSchema, 401: errorEnvelopeSchema, 422: errorEnvelopeSchema },
        },
      },
      async (request) => ok(await albumsService.createAlbum(deps.db, request.user.id, request.body)),
    )

    fastify.get(
      '/albums/:id',
      {
        preHandler: deps.authenticate,
        schema: {
          description: "Gets one of the authenticated user's albums by id.",
          tags: ['albums'],
          params: albumIdParamsSchema,
          response: { 200: albumResponseSchema, 401: errorEnvelopeSchema, 404: errorEnvelopeSchema },
        },
      },
      async (request, reply) => {
        const album = await albumsService.getAlbum(deps.db, request.params.id, request.user.id)
        if (!album) {
          reply.code(404).send(fail(ERROR_CODES.NOT_FOUND, 'Album not found'))
          return
        }
        return ok(album)
      },
    )

    fastify.patch(
      '/albums/:id',
      {
        preHandler: deps.authenticate,
        schema: {
          description: "Partially updates one of the authenticated user's albums.",
          tags: ['albums'],
          params: albumIdParamsSchema,
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
        const album = await albumsService.updateAlbum(deps.db, request.params.id, request.user.id, request.body)
        if (!album) {
          reply.code(404).send(fail(ERROR_CODES.NOT_FOUND, 'Album not found'))
          return
        }
        return ok(album)
      },
    )

    fastify.delete(
      '/albums/:id',
      {
        preHandler: deps.authenticate,
        schema: {
          description: "Deletes one of the authenticated user's albums.",
          tags: ['albums'],
          params: albumIdParamsSchema,
          response: { 200: emptyResponseSchema, 401: errorEnvelopeSchema, 404: errorEnvelopeSchema },
        },
      },
      async (request, reply) => {
        const removed = await albumsService.removeAlbum(deps.db, request.params.id, request.user.id)
        if (!removed) {
          reply.code(404).send(fail(ERROR_CODES.NOT_FOUND, 'Album not found'))
          return
        }
        return ok({})
      },
    )
  }
}
