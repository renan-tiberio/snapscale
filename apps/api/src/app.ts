import fastifyCors from '@fastify/cors'
import fastifyJwt from '@fastify/jwt'
import fastifyMultipart from '@fastify/multipart'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import { ERROR_CODES, MAX_UPLOAD_BYTES, fail, type ErrorCode } from '@snapscale/shared'
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyRequest,
  type FastifyServerOptions,
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
  UNAUTHORIZED_MESSAGE,
  createAuthenticateAllowingQueryTokenHandler,
  createAuthenticateHandler,
} from '@/plugins/auth-guard.js'
import { albumRoutes } from '@/routes/albums.js'
import { authRoutes } from '@/routes/auth.js'
import { fileTokenRoutes } from '@/routes/file-token.js'
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

/**
 * The subset of pino/Fastify logger options a test actually needs to inspect
 * emitted log lines — a custom `stream` to capture them, optionally a
 * `level`. Kept narrow instead of the full `FastifyServerOptions['logger']`
 * union so `buildLoggerOptions` can merge it with the always-on redacting
 * `req` serializer without fighting a deeply nested pino type.
 */
export interface LoggerTestOptions {
  readonly stream?: { write(msg: string): void }
  readonly level?: string
}

export interface BuildAppOptions {
  /**
   * Passed through to Fastify's `logger` option; `false` silences pino in
   * tests. A `LoggerTestOptions` object (e.g. `{ stream }`) is also accepted
   * so tests can capture log output — the `token` query param is always
   * redacted from `req.url` regardless of which form is passed (see
   * `buildLoggerOptions` below; fixes the credential-in-logs finding).
   */
  logger?: boolean | LoggerTestOptions
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

const REDACTED_TOKEN_MARKER = '[REDACTED]'

/**
 * Strips the value of a `?token=`/`&token=` query param from a URL string,
 * case-insensitively — the fix for the finding that a file-serving request's
 * full session/file JWT ends up verbatim in pino's default `req.url` log
 * field (and in browser history / Referer, which this redaction cannot
 * reach, but which is why the token is now short-lived and scope-limited —
 * see `plugins/auth-guard.ts`).
 */
function redactTokenFromUrl(url: string): string {
  return url.replace(/([?&]token=)[^&]*/gi, `$1${REDACTED_TOKEN_MARKER}`)
}

/**
 * The envelope `code` a sub-500 `error.statusCode` maps onto
 * (`docs/03-technical-design.md` §4). Anything else in the 4xx range is a
 * client-side problem too, so `VALIDATION_ERROR` is the default rather than
 * an escape hatch back to `INTERNAL`.
 */
const STATUS_ERROR_CODES: Readonly<Record<number, ErrorCode>> = {
  400: ERROR_CODES.VALIDATION_ERROR,
  401: ERROR_CODES.UNAUTHORIZED,
  404: ERROR_CODES.NOT_FOUND,
  413: ERROR_CODES.VALIDATION_ERROR,
  415: ERROR_CODES.VALIDATION_ERROR,
  429: ERROR_CODES.RATE_LIMITED,
}

function errorCodeForStatus(statusCode: number): ErrorCode {
  return STATUS_ERROR_CODES[statusCode] ?? ERROR_CODES.VALIDATION_ERROR
}

/**
 * A 401 reaching the error handler came from `@fastify/jwt`, not from us, and
 * its message quotes the underlying `jsonwebtoken` text ("jwt malformed", …).
 * Review finding L1 already banned that text from the response body in
 * `plugins/auth-guard.ts`; this keeps the same constant on the escape path.
 * Every other 4xx message is Fastify's own and safe to forward.
 */
function clientMessageForStatus(statusCode: number, error: unknown): string {
  if (statusCode === 401) {
    return UNAUTHORIZED_MESSAGE
  }
  return error instanceof Error ? error.message : 'Request rejected'
}

/**
 * Builds the `logger` option passed to `Fastify()`. Always installs a `req`
 * serializer that redacts `?token=` before it reaches the log line,
 * regardless of whether the caller passed `true`/`false` (production
 * default, test default) or a logger options object (tests that need to
 * inspect the emitted lines via a custom `stream`).
 */
function buildLoggerOptions(logger: BuildAppOptions['logger']): NonNullable<FastifyServerOptions['logger']> {
  if (logger === false) {
    return false
  }

  const base: LoggerTestOptions = typeof logger === 'object' && logger !== null ? logger : {}

  return {
    ...base,
    serializers: {
      req(request: FastifyRequest) {
        return {
          method: request.method,
          url: redactTokenFromUrl(request.url),
          hostname: request.hostname,
          remoteAddress: request.ip,
          ...(request.socket.remotePort === undefined ? {} : { remotePort: request.socket.remotePort }),
        }
      },
    },
  }
}

/**
 * Builds (but does not start listening on) the Fastify app. Kept separate
 * from `index.ts` so tests exercise the full app via `app.inject()` without
 * binding a port — see `docs/03-technical-design.md` §9.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<App> {
  const app = Fastify({
    logger: buildLoggerOptions(options.logger ?? true),
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
    if (error instanceof AuthenticationError) {
      reply.code(401).send(fail(ERROR_CODES.UNAUTHORIZED, error.message))
      return
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      request.log.warn({ err: error }, 'request validation failed')
      reply.code(422).send(fail(ERROR_CODES.VALIDATION_ERROR, error.message))
      return
    }

    // Everything Fastify itself raises arrives here as an `Error` carrying a
    // `statusCode`: a malformed JSON body (400), the multipart
    // `FST_FILES_LIMIT`/`FST_PARTS_LIMIT`/`FST_FIELDS_LIMIT` family (413), an
    // unsupported media type (415), `@fastify/rate-limit` (429), a jwt error
    // that escaped the guard (401). Collapsing all of those into 500 INTERNAL
    // was not only the wrong status — it charged the client's mistake to the
    // server on the error-rate dashboard phase 2 reads.
    const statusCode = (error as { statusCode?: unknown }).statusCode
    if (typeof statusCode === 'number' && statusCode < 500) {
      request.log.warn({ err: error }, 'request rejected')
      reply
        .code(statusCode)
        .send(fail(errorCodeForStatus(statusCode), clientMessageForStatus(statusCode, error)))
      return
    }

    // Detail (message, stack) stays server-side in the pino log; the envelope
    // sent to the client never carries it — see docs/03-technical-design.md §4.
    request.log.error({ err: error }, 'unhandled error')
    reply.code(500).send(fail(ERROR_CODES.INTERNAL, 'Internal server error'))
  })

  await app.register(healthRoutes)

  if (options.jwtSecret) {
    // Algorithms pinned explicitly on both sides (review finding L5): without
    // this, `@fastify/jwt`/`jsonwebtoken` still default to HS256 today, but a
    // future dependency bump silently widening the accepted `alg` set would
    // be an algorithm-confusion vector, not just a config nicety.
    await app.register(fastifyJwt, {
      secret: options.jwtSecret,
      sign: { algorithm: 'HS256' },
      verify: { algorithms: ['HS256'] },
    })
    // Decorated here rather than by a plugin: a plain `async (fastify) => {}`
    // is *encapsulated* by Fastify, so decorators it sets die with its child
    // context and never reach this instance. Every route below needs
    // `authenticate`, so the composition root owns it — and because the two
    // handlers are also kept as locals, the guarded registrations can simply
    // nest inside this block instead of re-deriving them from an
    // `App['authenticate'] | undefined` decorator.
    const authenticate = createAuthenticateHandler(app)
    const authenticateAllowingQueryToken = createAuthenticateAllowingQueryTokenHandler(app)
    app.decorate('authenticate', authenticate)
    app.decorate('authenticateAllowingQueryToken', authenticateAllowingQueryToken)

    await app.register(fileTokenRoutes({ authenticate }))

    if (options.db && options.mailer && options.otpTtlSeconds) {
      await app.register(
        authRoutes({ db: options.db, mailer: options.mailer, otpTtlSeconds: options.otpTtlSeconds }),
      )
    }

    if (options.db) {
      await app.register(albumRoutes({ db: options.db, authenticate }))
    }

    if (options.db && options.uploadDir) {
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
  }

  return app
}
