import { ERROR_CODES, fail } from '@snapscale/shared'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

/**
 * Represents the authenticated user payload extracted from a JWT token.
 * The JWT payload must include `sub` (user ID) and `email` (user email).
 */
export interface AuthenticatedUser {
  readonly id: string
  readonly email: string
}

/**
 * The two token scopes this API issues (docs/03 §4). `session` is the 1h
 * token from `/auth/otp/verify` — full API access, header only. `file` is the
 * 60s token from `/auth/file-token` — read-only file access, the only scope
 * ever accepted from `?token=`. Neither guard accepts the other's scope: a
 * leaked file URL now carries at most 60s of file-only access instead of a
 * full 1h session credential (the finding this file fixes).
 */
type TokenScope = 'session' | 'file'

/**
 * Custom error class for authentication failures.
 */
export class AuthenticationError extends Error {
  readonly isAuthenticationError = true

  constructor(message: string) {
    super(message)
    this.name = 'AuthenticationError'
    Object.setPrototypeOf(this, AuthenticationError.prototype)
  }
}

/**
 * Augment FastifyInstance to include the authenticate preHandler decorators.
 * `authenticateAllowingQueryToken` is the `<img>`-tag fallback (docs/03 §4):
 * a header still requires a `session` token, but the `?token=` fallback (used
 * only when no Authorization header is present) accepts a `file` token only —
 * used only by file-serving GET routes, never by routes that mutate anything.
 */
declare module 'fastify' {
  interface FastifyInstance {
    authenticate?: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    authenticateAllowingQueryToken?: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

/**
 * `@fastify/jwt` types `request.user` as `FastifyJWT['user']`, which defaults
 * to `{ [key: string]: any }` — this pins it to the shape the preHandler
 * below actually sets, so every guarded route reads `request.user.id` /
 * `.email` without an `any` escape.
 */
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: AuthenticatedUser
  }
}

/** Extracts the bearer token from `Authorization: Bearer <token>` — `undefined` if absent/malformed. */
function extractBearerToken(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization
  if (!authHeader) {
    return undefined
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    throw new AuthenticationError('Invalid Authorization header format')
  }

  return parts[1]
}

/**
 * Extracts `?token=` from the query string — the `<img>`-tag fallback
 * (docs/03 §4), since browsers cannot attach an Authorization header to an
 * image request.
 */
function extractQueryToken(request: FastifyRequest): string | undefined {
  const query = request.query as Record<string, unknown> | undefined
  const token = query?.token
  return typeof token === 'string' && token.length > 0 ? token : undefined
}

/**
 * Verifies `token`, requires `payload.scope === expectedScope`, and attaches
 * `request.user` — or throws `AuthenticationError`. A token minted for the
 * other scope (e.g. a 1h session token replayed as `?token=`, or a 60s file
 * token replayed in a header) is rejected here, not just routed differently —
 * this is the actual scope boundary, not the transport it arrived on.
 */
async function verifyAndAttachUser(
  fastify: FastifyInstance,
  request: FastifyRequest,
  token: string,
  expectedScope: TokenScope,
): Promise<void> {
  // Verify the JWT using @fastify/jwt — throws if invalid, expired, or tampered.
  const payload = await fastify.jwt.verify(token)

  if (typeof payload === 'object' && payload !== null && 'sub' in payload && 'scope' in payload) {
    const { sub, scope, email } = payload as Record<string, unknown>
    if (typeof sub === 'string' && scope === expectedScope) {
      // File tokens carry no email (docs/03 §4: `sub` only) — file routes
      // never read `request.user.email`, so an empty string is a safe filler
      // that keeps `AuthenticatedUser` a single shape for every guard.
      const attachedEmail = typeof email === 'string' ? email : ''
      request.user = { id: sub, email: attachedEmail } as unknown as typeof request.user
      return
    }
  }

  throw new AuthenticationError('Invalid token payload')
}

/**
 * Sends the standard 401 envelope for any authentication failure, JWT or
 * otherwise. `AuthenticationError` messages are ours (never raw library
 * text) and safe to send as-is. Anything else — @fastify/jwt's own verify
 * errors ("jwt expired", "invalid signature", etc., review finding L1 —
 * `auth-guard.ts:104-105`) is normalized to a constant client-facing message;
 * the real detail goes to the server log via `request.log.warn`, never the
 * response body.
 */
const GENERIC_UNAUTHORIZED_MESSAGE = 'Invalid or expired token'

function sendUnauthorized(request: FastifyRequest, reply: FastifyReply, error: unknown): void {
  if (error instanceof AuthenticationError) {
    reply.code(401).send(fail(ERROR_CODES.UNAUTHORIZED, error.message))
    return
  }
  const detail = error instanceof Error ? error.message : 'unknown error'
  request.log.warn({ err: error }, `authentication failed: ${detail}`)
  reply.code(401).send(fail(ERROR_CODES.UNAUTHORIZED, GENERIC_UNAUTHORIZED_MESSAGE))
}

/**
 * Creates the authentication preHandler function that verifies JWT Bearer
 * tokens. Header only, `session` scope only — used as a preHandler on every
 * route that requires authentication except the file-serving GETs below.
 */
export function createAuthenticateHandler(fastify: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const token = extractBearerToken(request)
      if (!token) {
        throw new AuthenticationError('Missing Authorization header')
      }
      await verifyAndAttachUser(fastify, request, token, 'session')
    } catch (error) {
      sendUnauthorized(request, reply, error)
    }
  }
}

/**
 * Same header verification as `createAuthenticateHandler` (still `session`
 * scope only), plus a `?token=` fallback when no Authorization header is
 * present (docs/03 §4) — for file-serving GET routes only (`GET
 * /images/:id/file`, `GET /files/*`), never for routes that mutate state. The
 * `?token=` fallback accepts `file`-scope tokens only: a `session` token
 * replayed as `?token=` — the vulnerability this guard closes — 401s here.
 */
export function createAuthenticateAllowingQueryTokenHandler(fastify: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const bearerToken = extractBearerToken(request)
      if (bearerToken) {
        await verifyAndAttachUser(fastify, request, bearerToken, 'session')
        return
      }

      const queryToken = extractQueryToken(request)
      if (!queryToken) {
        throw new AuthenticationError('Missing Authorization header or token query parameter')
      }
      await verifyAndAttachUser(fastify, request, queryToken, 'file')
    } catch (error) {
      sendUnauthorized(request, reply, error)
    }
  }
}

/**
 * Auth-guard plugin that provides JWT verification via preHandler.
 * Registers both authenticate preHandlers on the app instance.
 */
export async function authGuardPlugin(fastify: FastifyInstance): Promise<void> {
  const appRecord = fastify as unknown as Record<string, unknown>
  appRecord.authenticate = createAuthenticateHandler(fastify)
  appRecord.authenticateAllowingQueryToken = createAuthenticateAllowingQueryTokenHandler(fastify)
}
