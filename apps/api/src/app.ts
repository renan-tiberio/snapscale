import fastifyCors from '@fastify/cors'
import fastifyJwt from '@fastify/jwt'
import fastifyMultipart from '@fastify/multipart'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import { ERROR_CODES, MAX_UPLOAD_BYTES, fail } from '@snapscale/shared'
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

import type { Database } from '@/db/index.js'
import type { Mailer } from '@/services/mailer.js'

import {
  AuthenticationError,
  authGuardPlugin,
  createAuthenticateAllowingQueryTokenHandler,
  createAuthenticateHandler,
} from '@/plugins/auth-guard.js'
import { albumRoutes } from '@/routes/albums.js'
import { authRoutes } from '@/routes/auth.js'
import { fileRoutes } from '@/routes/files.js'
import { healthRoutes } from '@/routes/health.js'
import { imageProcessRoutes } from '@/routes/images-process.js'
import { imageRoutes } from '@/routes/images.js'
import { ensureUploadDir } from '@/services/storage.js'

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
  /**
   * Auth routes (`/auth/otp/*`, §4/§5) only mount when every dependency
   * below is supplied — tests that only need `/health` (the bulk of
   * app.test.ts) build a db-less app and never pay for jwt/rate-limit setup.
   */
  db?: Database
  mailer?: Mailer
  jwtSecret?: string
  otpTtlSeconds?: number
  /**
   * Root of the upload volume (docs/03 §7). Albums never touch it; images
   * routes only mount once this — plus `db` and `jwtSecret` — are supplied,
   * same "pay only for what you configure" rule as the auth routes above.
   */
  uploadDir?: string
  /**
   * Origin allowed to call this api from a browser — the Vite dev server by
   * default. Registered as an allowlist rather than an echo of whatever
   * `Origin` arrives, so the header stays a control instead of decoration.
   */
  webOrigin?: string
}

/** Vite's dev server origin; the only browser client in phase 1. */
const DEFAULT_WEB_ORIGIN = 'http://localhost:5173'

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

  // Registered before any route so preflights are answered for all of them.
  // The SPA and the api are separate origins (:5173 → :4000), so without
  // this every browser call fails before it reaches a handler — invisible to
  // `app.inject()`-based tests, which is why `cors.test.ts` exists.
  await app.register(fastifyCors, {
    origin: [options.webOrigin ?? DEFAULT_WEB_ORIGIN],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization'],
  })

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
    // Check for AuthenticationError using property check (more reliable than instanceof)
    if (error instanceof AuthenticationError) {
      reply.code(401).send(fail(ERROR_CODES.UNAUTHORIZED, error.message))
      return
    }
    if (error && typeof error === 'object' && (error as Record<string, unknown>).isAuthenticationError === true && error instanceof Error) {
      reply.code(401).send(fail(ERROR_CODES.UNAUTHORIZED, error.message))
      return
    }

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

  if (options.jwtSecret) {
    await app.register(fastifyJwt, { secret: options.jwtSecret })
    await app.register(authGuardPlugin)
    // Ensure both authenticate decorators are available on the app instance
    // — if the plugin didn't set them (due to proxy/scope issues), set them
    // directly.
    const appRecord = app as unknown as Record<string, unknown>
    if (typeof appRecord.authenticate !== 'function') {
      appRecord.authenticate = createAuthenticateHandler(app)
    }
    if (typeof appRecord.authenticateAllowingQueryToken !== 'function') {
      appRecord.authenticateAllowingQueryToken = createAuthenticateAllowingQueryTokenHandler(app)
    }
  }

  if (options.db && options.mailer && options.jwtSecret && options.otpTtlSeconds) {
    await app.register(
      authRoutes({ db: options.db, mailer: options.mailer, otpTtlSeconds: options.otpTtlSeconds }),
    )
  }

  if (options.db && options.jwtSecret) {
    const authenticate = app.authenticate
    if (!authenticate) {
      throw new Error('albums routes require app.authenticate — jwtSecret registration above must run first')
    }
    await app.register(albumRoutes({ db: options.db, authenticate }))
  }

  if (options.db && options.jwtSecret && options.uploadDir) {
    const authenticate = app.authenticate
    if (!authenticate) {
      throw new Error('images routes require app.authenticate — jwtSecret registration above must run first')
    }
    const authenticateAllowingQueryToken = app.authenticateAllowingQueryToken
    if (!authenticateAllowingQueryToken) {
      throw new Error(
        'file routes require app.authenticateAllowingQueryToken — jwtSecret registration above must run first',
      )
    }
    await ensureUploadDir(options.uploadDir)
    // Explicit limits beyond `fileSize` close a DoS gap flagged in review:
    // without them `files`/`fields`/`parts` default to effectively
    // unbounded, so one authenticated request could push far more than
    // `MAX_UPLOAD_BYTES` of multipart data at the parser. The upload
    // contract is exactly one `file` part plus one `albumId` field
    // (docs/03 §4/§7) — these limits give that a little slack, not room
    // for abuse.
    await app.register(fastifyMultipart, {
      limits: {
        fileSize: MAX_UPLOAD_BYTES,
        files: 1,
        fields: 2,
        fieldSize: 1024,
        fieldNameSize: 100,
        parts: 4,
      },
    })
    await app.register(
      imageRoutes({
        db: options.db,
        uploadDir: options.uploadDir,
        authenticate,
        authenticateAllowingQueryToken,
      }),
    )
    await app.register(
      imageProcessRoutes({ db: options.db, uploadDir: options.uploadDir, authenticate }),
    )
    await app.register(
      fileRoutes({
        db: options.db,
        uploadDir: options.uploadDir,
        authenticate: authenticateAllowingQueryToken,
      }),
    )
  }

  return app
}
