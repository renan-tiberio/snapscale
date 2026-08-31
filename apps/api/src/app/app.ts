import fastifyCors from '@fastify/cors'
import fastifyJwt from '@fastify/jwt'
import fastifyMultipart from '@fastify/multipart'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import { ERROR_CODES, HTTP_STATUS, MAX_UPLOAD_BYTES, fail, type ErrorCode } from '@snapscale/shared'
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
import type { Mailer } from '@/services/mailer/index.js'

import { DEFAULT_WEB_ORIGIN } from '@/config/index.js'
import {
  AuthenticationError,
  UNAUTHORIZED_MESSAGE,
  createAuthenticateAllowingQueryTokenHandler,
  createAuthenticateHandler,
} from '@/plugins/auth-guard/index.js'
import { albumRoutes } from '@/routes/albums/index.js'
import { authRoutes } from '@/routes/auth/index.js'
import { fileTokenRoutes } from '@/routes/file-token/index.js'
import { fileRoutes } from '@/routes/files/index.js'
import { healthRoutes } from '@/routes/health/index.js'
import { imageRoutes } from '@/routes/images/index.js'
import { imageProcessRoutes } from '@/routes/images-process/index.js'
import { meRoutes } from '@/routes/me/index.js'
import { ensureUploadDir } from '@/services/storage/index.js'

/** Fastify instance typed with the Zod type provider — the shape every route module works with. */
export type App = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>

/** Narrow on purpose: the full `FastifyServerOptions['logger']` union cannot be spread into. */
export type LoggerTestOptions = {
  readonly stream?: { write(msg: string): void }
  readonly level?: string
}

export type BuildAppOptions = {
  logger?: boolean | LoggerTestOptions
  /** Auth routes only mount when `db`, `mailer` and `otpTtlSeconds` are all supplied. */
  db?: Database
  mailer?: Mailer
  jwtSecret?: string
  otpTtlSeconds?: number
  /** Root of the upload volume; image and file routes only mount once it is supplied. */
  uploadDir?: string
  /** Registered as an allowlist rather than an echo of whatever `Origin` arrives. */
  webOrigin?: string
}

const REDACTED_TOKEN_MARKER = '[REDACTED]'

/** The 4xx/5xx boundary itself, which is a comparison rather than a status we send. */
const INTERNAL_SERVER_ERROR_STATUS = 500

const MAX_MULTIPART_FIELD_BYTES = 1024 // 1 KB

type RedactTokenFromUrlParams = {
  readonly url: string
}

/** A file request carries its JWT in `?token=`, and pino logs `req.url` verbatim. */
const redactTokenFromUrl = ({ url }: RedactTokenFromUrlParams): string =>
  url.replace(/([?&]token=)[^&]*/gi, `$1${REDACTED_TOKEN_MARKER}`)

/** Anything 4xx not listed is still the client's mistake, so `VALIDATION_ERROR` is the default. */
const STATUS_ERROR_CODES: Readonly<Record<number, ErrorCode>> = {
  [HTTP_STATUS.BAD_REQUEST]: ERROR_CODES.VALIDATION_ERROR,
  [HTTP_STATUS.UNAUTHORIZED]: ERROR_CODES.UNAUTHORIZED,
  [HTTP_STATUS.NOT_FOUND]: ERROR_CODES.NOT_FOUND,
  [HTTP_STATUS.PAYLOAD_TOO_LARGE]: ERROR_CODES.VALIDATION_ERROR,
  [HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE]: ERROR_CODES.VALIDATION_ERROR,
  [HTTP_STATUS.TOO_MANY_REQUESTS]: ERROR_CODES.RATE_LIMITED,
}

type ErrorCodeForStatusParams = {
  readonly statusCode: number
}

const errorCodeForStatus = ({ statusCode }: ErrorCodeForStatusParams): ErrorCode =>
  STATUS_ERROR_CODES[statusCode] ?? ERROR_CODES.VALIDATION_ERROR

type ClientMessageForStatusParams = {
  readonly statusCode: number
  readonly error: unknown
}

/** A 401 here came from `@fastify/jwt` and quotes `jsonwebtoken` ("jwt malformed"); never forward that. */
const clientMessageForStatus = ({ statusCode, error }: ClientMessageForStatusParams): string => {
  if (statusCode === HTTP_STATUS.UNAUTHORIZED) {
    return UNAUTHORIZED_MESSAGE
  }
  return error instanceof Error ? error.message : 'Request rejected'
}

type BuildLoggerOptionsParams = {
  readonly logger: BuildAppOptions['logger']
}

/** The `req` serializer is installed for every logger form so `?token=` can never reach a log line. */
const buildLoggerOptions = ({
  logger,
}: BuildLoggerOptionsParams): NonNullable<FastifyServerOptions['logger']> => {
  if (logger === false) {
    return false
  }

  const base: LoggerTestOptions = typeof logger === 'object' && logger !== null ? logger : {}

  return {
    ...base,
    serializers: {
      req: (request: FastifyRequest) => ({
        method: request.method,
        url: redactTokenFromUrl({ url: request.url }),
        hostname: request.hostname,
        remoteAddress: request.ip,
        ...(request.socket.remotePort === undefined
          ? {}
          : { remotePort: request.socket.remotePort }),
      }),
    },
  }
}

/** Builds but does not listen, so tests drive the full app through `app.inject()` without a port. */
export const buildApp = async (options: BuildAppOptions = {}): Promise<App> => {
  const app = Fastify({
    logger: buildLoggerOptions({ logger: options.logger ?? true }),
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Registered before any route so preflights are answered for all of them.
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
    reply.code(HTTP_STATUS.NOT_FOUND).send(
      fail({
        code: ERROR_CODES.NOT_FOUND,
        message: `Route ${request.method} ${request.url} not found`,
      }),
    )
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthenticationError) {
      reply
        .code(HTTP_STATUS.UNAUTHORIZED)
        .send(fail({ code: ERROR_CODES.UNAUTHORIZED, message: error.message }))
      return
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      request.log.warn({ err: error }, 'request validation failed')
      reply
        .code(HTTP_STATUS.UNPROCESSABLE_ENTITY)
        .send(fail({ code: ERROR_CODES.VALIDATION_ERROR, message: error.message }))
      return
    }

    // Fastify raises its own rejections as plain `Error`s carrying a `statusCode`;
    // collapsing them into 500 charges the client's mistake to the server.
    const statusCode = (error as { statusCode?: unknown }).statusCode
    if (typeof statusCode === 'number' && statusCode < INTERNAL_SERVER_ERROR_STATUS) {
      request.log.warn({ err: error }, 'request rejected')
      reply.code(statusCode).send(
        fail({
          code: errorCodeForStatus({ statusCode }),
          message: clientMessageForStatus({ statusCode, error }),
        }),
      )
      return
    }

    // Message and stack stay in the pino log; the envelope sent to the client never carries them.
    request.log.error({ err: error }, 'unhandled error')
    reply
      .code(INTERNAL_SERVER_ERROR_STATUS)
      .send(fail({ code: ERROR_CODES.INTERNAL, message: 'Internal server error' }))
  })

  await app.register(healthRoutes)

  if (options.jwtSecret) {
    // Pinned on both sides: a dependency bump that widened the accepted `alg` set would
    // otherwise become an algorithm-confusion vector rather than a config nicety.
    await app.register(fastifyJwt, {
      secret: options.jwtSecret,
      sign: { algorithm: 'HS256' },
      verify: { algorithms: ['HS256'] },
    })
    // Decorated here, not in a plugin: a plain `async (fastify) => {}` is encapsulated by
    // Fastify, so decorators it sets die with its child context and never reach this instance.
    const authenticate = createAuthenticateHandler({ fastify: app })
    const authenticateAllowingQueryToken = createAuthenticateAllowingQueryTokenHandler({
      fastify: app,
    })
    app.decorate('authenticate', authenticate)
    app.decorate('authenticateAllowingQueryToken', authenticateAllowingQueryToken)

    await app.register(fileTokenRoutes({ authenticate }))

    if (options.db && options.mailer && options.otpTtlSeconds) {
      await app.register(
        authRoutes({
          db: options.db,
          mailer: options.mailer,
          otpTtlSeconds: options.otpTtlSeconds,
        }),
      )
    }

    if (options.db) {
      await app.register(meRoutes({ db: options.db, authenticate }))
      await app.register(albumRoutes({ db: options.db, authenticate }))
    }

    if (options.db && options.uploadDir) {
      await ensureUploadDir({ uploadDir: options.uploadDir })
      // Unset, `files`/`fields`/`parts` default to effectively unbounded, so one request
      // could push far more than `MAX_UPLOAD_BYTES` past the parser.
      await app.register(fastifyMultipart, {
        limits: {
          fileSize: MAX_UPLOAD_BYTES,
          files: 1,
          fields: 2,
          fieldSize: MAX_MULTIPART_FIELD_BYTES,
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
