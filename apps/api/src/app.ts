import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import { ERROR_CODES, fail } from '@snapscale/shared'
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type RawReplyDefaultExpression,
  type RawRequestDefaultExpression,
  type RawServerDefault,
} from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'

import { healthRoutes } from '@/routes/health.js'

/** Fastify instance typed with the Zod type provider — the shape every route module works with. */
export type App = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>

export interface BuildAppOptions {
  /** Passed straight through to Fastify's `logger` option; `false` silences pino in tests. */
  logger?: boolean
}

/**
 * Builds (but does not start listening on) the Fastify app. Kept separate
 * from `index.ts` so tests exercise the full app via `app.inject()` without
 * binding a port — see `docs/03-technical-design.md` §9.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<App> {
  const app = Fastify({
    logger: options.logger ?? true,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(fastifySwagger, {
    openapi: {
      info: { title: '@snapscale/api', version: '0.0.0' },
    },
    transform: jsonSchemaTransform,
  })

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  })

  app.setNotFoundHandler((request, reply) => {
    reply
      .code(404)
      .send(fail(ERROR_CODES.NOT_FOUND, `Route ${request.method} ${request.url} not found`))
  })

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      request.log.warn({ err: error }, 'request validation failed')
      reply.code(422).send(fail(ERROR_CODES.VALIDATION_ERROR, error.message))
      return
    }

    // Detail (message, stack) stays server-side in the pino log; the envelope
    // sent to the client never carries it — see docs/03-technical-design.md §4.
    request.log.error({ err: error }, 'unhandled error')
    reply.code(500).send(fail(ERROR_CODES.INTERNAL, 'Internal server error'))
  })

  await app.register(healthRoutes)

  return app
}
