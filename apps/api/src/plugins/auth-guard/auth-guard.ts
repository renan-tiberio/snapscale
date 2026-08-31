import { ERROR_CODES, HTTP_STATUS, fail } from '@snapscale/shared'
import { z } from 'zod'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

export type AuthenticatedUser = {
  readonly id: string
  readonly email: string
}

/**
 * `session` is the 1h token from `/auth/otp/verify` — full API access, header only.
 * `file` is the 60s token from `/auth/file-token` — read-only, the only scope ever
 * accepted from `?token=`, so a leaked image URL carries no session credential.
 */
type TokenScope = 'session' | 'file'

export type AuthenticationErrorParams = {
  readonly message: string
}

export class AuthenticationError extends Error {
  readonly isAuthenticationError = true

  constructor({ message }: AuthenticationErrorParams) {
    super(message)
    this.name = 'AuthenticationError'
    // Restored explicitly: extending a built-in through downlevelled output otherwise
    // loses the prototype and `instanceof` silently answers false.
    Object.setPrototypeOf(this, AuthenticationError.prototype)
  }
}

declare module 'fastify' {
  // Module augmentation is the one thing `type` cannot do.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface FastifyInstance {
    authenticate?: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    authenticateAllowingQueryToken?: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

declare module '@fastify/jwt' {
  // `@fastify/jwt` types `request.user` as `{ [key: string]: any }`; this pins it to the
  // shape the guards below actually attach. Module augmentation forces `interface`.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface FastifyJWT {
    user: AuthenticatedUser
  }
}

const BEARER_SCHEME = 'Bearer'

type ExtractBearerTokenParams = {
  readonly request: FastifyRequest
}

const extractBearerToken = ({ request }: ExtractBearerTokenParams): string | undefined => {
  const authHeader = request.headers.authorization
  if (!authHeader) return undefined

  const [scheme, token, ...rest] = authHeader.split(' ')
  if (scheme !== BEARER_SCHEME || !token || rest.length > 0) {
    throw new AuthenticationError({ message: 'Invalid Authorization header format' })
  }

  return token
}

/** Browsers cannot attach an Authorization header to an `<img src>`, hence the query fallback. */
const queryTokenSchema = z.object({ token: z.string().min(1) })

type ExtractQueryTokenParams = {
  readonly request: FastifyRequest
}

const extractQueryToken = ({ request }: ExtractQueryTokenParams): string | undefined => {
  const parsed = queryTokenSchema.safeParse(request.query)
  return parsed.success ? parsed.data.token : undefined
}

const tokenPayloadSchema = z.object({
  sub: z.string(),
  scope: z.string(),
  // File tokens carry `sub` only; file routes never read the email, so a missing or
  // non-string claim falls back to '' rather than failing the whole verification.
  email: z.string().catch(''),
})

type VerifyAndAttachUserParams = {
  readonly fastify: FastifyInstance
  readonly request: FastifyRequest
  readonly token: string
  readonly expectedScope: TokenScope
}

/**
 * The scope boundary itself, not the transport: a session token replayed as `?token=`
 * and a file token replayed in a header are both rejected here.
 */
const verifyAndAttachUser = async ({
  fastify,
  request,
  token,
  expectedScope,
}: VerifyAndAttachUserParams): Promise<void> => {
  const payload = tokenPayloadSchema.safeParse(await fastify.jwt.verify(token))

  if (!payload.success || payload.data.scope !== expectedScope) {
    throw new AuthenticationError({ message: 'Invalid token payload' })
  }

  // `request.user` is `@fastify/jwt`'s own attach point — the only way to hand the
  // verified identity to downstream handlers.
  // eslint-disable-next-line no-param-reassign
  request.user = { id: payload.data.sub, email: payload.data.email }
}

/** Client-facing text for every auth failure — library messages ("jwt expired") never ship. */
export const UNAUTHORIZED_MESSAGE = 'Invalid or expired token'

type SendUnauthorizedParams = {
  readonly request: FastifyRequest
  readonly reply: FastifyReply
  readonly error: unknown
}

const sendUnauthorized = ({ request, reply, error }: SendUnauthorizedParams): void => {
  if (error instanceof AuthenticationError) {
    reply
      .code(HTTP_STATUS.UNAUTHORIZED)
      .send(fail({ code: ERROR_CODES.UNAUTHORIZED, message: error.message }))
    return
  }

  const detail = error instanceof Error ? error.message : 'unknown error'
  request.log.warn({ err: error }, `authentication failed: ${detail}`)
  reply
    .code(HTTP_STATUS.UNAUTHORIZED)
    .send(fail({ code: ERROR_CODES.UNAUTHORIZED, message: UNAUTHORIZED_MESSAGE }))
}

export type CreateAuthenticateHandlerParams = {
  readonly fastify: FastifyInstance
}

export type AuthenticateHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>

/** Header only, `session` scope only — the guard every route uses except the file GETs. */
export const createAuthenticateHandler =
  ({ fastify }: CreateAuthenticateHandlerParams): AuthenticateHandler =>
  async (request, reply) => {
    try {
      const token = extractBearerToken({ request })
      if (!token) {
        throw new AuthenticationError({ message: 'Missing Authorization header' })
      }
      await verifyAndAttachUser({ fastify, request, token, expectedScope: 'session' })
    } catch (error) {
      sendUnauthorized({ request, reply, error })
    }
  }

/**
 * Same header verification, plus a `?token=` fallback used only when no Authorization
 * header is present — for file-serving GETs only, and `file` scope only.
 */
export const createAuthenticateAllowingQueryTokenHandler =
  ({ fastify }: CreateAuthenticateHandlerParams): AuthenticateHandler =>
  async (request, reply) => {
    try {
      const bearerToken = extractBearerToken({ request })
      if (bearerToken) {
        await verifyAndAttachUser({
          fastify,
          request,
          token: bearerToken,
          expectedScope: 'session',
        })
        return
      }

      const queryToken = extractQueryToken({ request })
      if (!queryToken) {
        throw new AuthenticationError({
          message: 'Missing Authorization header or token query parameter',
        })
      }
      await verifyAndAttachUser({ fastify, request, token: queryToken, expectedScope: 'file' })
    } catch (error) {
      sendUnauthorized({ request, reply, error })
    }
  }
