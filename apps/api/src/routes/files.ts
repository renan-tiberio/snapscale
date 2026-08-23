import { createReadStream } from 'node:fs'

import { ERROR_CODES, fail } from '@snapscale/shared'
import { z } from 'zod'

import type { App } from '@/app.js'
import type { Database } from '@/db/index.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { FileAccessError, resolveOwnedFile } from '@/services/file-access.js'

export interface FileRoutesDeps {
  readonly db: Database
  readonly uploadDir: string
  /**
   * The query-token variant, not the plain one: a browser `<img src>` cannot
   * attach an Authorization header, so these GETs accept `?token=` as a
   * fallback (docs/03 §4). Read-only routes only.
   */
  readonly authenticate: NonNullable<App['authenticateAllowingQueryToken']>
}

/** Wildcard segment of `/files/*` — the storage path relative to `UPLOAD_DIR`. */
const filePathParamsSchema = z.object({ '*': z.string().min(1) })

/**
 * `GET /files/*` (docs/03 §7) — serves originals and processed output by
 * storage path.
 *
 * Every failure answers the same 404: traversal attempt, unknown path, and
 * "exists but belongs to someone else" are indistinguishable from outside, so
 * the route cannot be used to probe what other accounts own.
 */
export function fileRoutes(deps: FileRoutesDeps): FastifyPluginAsyncZod {
  return async (fastify) => {
    fastify.get(
      '/files/*',
      {
        preHandler: deps.authenticate,
        schema: {
          description:
            'Streams a stored file (original or processed) owned by the caller. Accepts `?token=` for `<img>` tags, or a normal Authorization header.',
          tags: ['files'],
          params: filePathParamsSchema,
          // No `response` map at all: the success body is raw image bytes,
          // not the JSON envelope, and declaring only the error codes would
          // make the zod type provider reject the 200 binary reply. Same
          // convention as `GET /images/:id/file` in `images.ts`.
        },
      },
      async (request, reply) => {
        try {
          const file = await resolveOwnedFile(
            { db: deps.db, uploadDir: deps.uploadDir },
            request.params['*'],
            request.user.id,
          )
          reply.header('content-type', file.mimeType)
          // Explicit 200 keeps the zod type provider from serializing this
          // binary reply against one of the declared error schemas.
          return reply.code(200).send(createReadStream(file.absolutePath))
        } catch (error) {
          if (error instanceof FileAccessError) {
            reply.code(404).send(fail(ERROR_CODES.NOT_FOUND, error.message))
            return
          }
          throw error
        }
      },
    )
  }
}
