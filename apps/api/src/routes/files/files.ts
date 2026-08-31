import { createReadStream } from 'node:fs'

import { ERROR_CODES, HTTP_STATUS, UserId, fail } from '@snapscale/shared'
import { z } from 'zod'

import type { App } from '@/app/index.js'
import type { Database } from '@/db/index.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { FileAccessError, resolveOwnedFile } from '@/services/file-access/index.js'
import { FILE_CACHE_CONTROL } from '@/services/storage/index.js'

export type FileRoutesDeps = {
  readonly db: Database
  readonly uploadDir: string
  /** The query-token variant: a browser `<img src>` cannot attach an Authorization header. */
  readonly authenticate: NonNullable<App['authenticateAllowingQueryToken']>
}

/** Wildcard segment of `/files/*` — the storage path relative to `UPLOAD_DIR`. */
const filePathParamsSchema = z.object({ '*': z.string().min(1) })

/**
 * Traversal attempt, unknown path and "exists but belongs to someone else" all answer the same
 * 404, so the route cannot be used to probe what other accounts own.
 */
export const fileRoutes =
  ({ db, uploadDir, authenticate }: FileRoutesDeps): FastifyPluginAsyncZod =>
  async (fastify) => {
    fastify.get(
      '/files/*',
      {
        preHandler: authenticate,
        schema: {
          description:
            'Streams a stored file (original or processed) owned by the caller. Accepts `?token=` for `<img>` tags, or a normal Authorization header.',
          tags: ['files'],
          params: filePathParamsSchema,
          // No `response` map at all: the success body is raw bytes, not the JSON envelope,
          // and declaring only the error codes makes the zod provider reject the 200 reply.
        },
      },
      async (request, reply) => {
        try {
          const file = await resolveOwnedFile({
            db,
            uploadDir,
            storagePath: request.params['*'],
            ownerId: new UserId(request.user.id),
          })
          reply.header('content-type', file.mimeType)
          // `?token=` rotates every 60s, the bytes never change: without a validator every
          // rotation re-downloads the page. `private` keeps it out of any shared cache.
          reply.header('cache-control', FILE_CACHE_CONTROL)
          reply.header('etag', file.etag)
          if (request.headers['if-none-match'] === file.etag) {
            return reply.code(HTTP_STATUS.NOT_MODIFIED).send()
          }
          // Explicit 200 keeps the zod provider from serializing this binary reply against
          // one of the declared error schemas.
          return reply.code(HTTP_STATUS.OK).send(createReadStream(file.absolutePath))
        } catch (error) {
          if (error instanceof FileAccessError) {
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
