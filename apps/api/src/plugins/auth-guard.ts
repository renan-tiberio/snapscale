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
 * same verification, but also accepts `?token=` when no Authorization
 * header is present — used only by file-serving GET routes, never by
 * routes that mutate anything.
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

/** Verifies `token`, attaches `request.user`, or throws `AuthenticationError`. */
async function verifyAndAttachUser(fastify: FastifyInstance, request: FastifyRequest, token: string): Promise<void> {
  // Verify the JWT using @fastify/jwt — throws if invalid, expired, or tampered.
  const payload = await fastify.jwt.verify(token)

  if (typeof payload === 'object' && payload !== null && 'sub' in payload && 'email' in payload) {
    const sub = payload.sub
    const email = payload.email
    if (typeof sub === 'string' && typeof email === 'string') {
      request.user = { id: sub, email } as unknown as typeof request.user
      return
    }
  }

  throw new AuthenticationError('Invalid token payload')
}

/** Sends the standard 401 envelope for any authentication failure, JWT or otherwise. */
function sendUnauthorized(reply: FastifyReply, error: unknown): void {
  if (error instanceof AuthenticationError) {
    reply.code(401).send(fail(ERROR_CODES.UNAUTHORIZED, error.message))
    return
  }
  // Any error from JWT verification (invalid, expired, tampered, etc.) is an
  // auth failure — normalized to the same 401 envelope.
  const message = error instanceof Error ? error.message : 'Invalid or expired token'
  reply.code(401).send(fail(ERROR_CODES.UNAUTHORIZED, message))
}

/**
 * Creates the authentication preHandler function that verifies JWT Bearer tokens.
 * This function is used as a preHandler on routes that require authentication.
 */
export function createAuthenticateHandler(fastify: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const token = extractBearerToken(request)
      if (!token) {
        throw new AuthenticationError('Missing Authorization header')
      }
      await verifyAndAttachUser(fastify, request, token)
    } catch (error) {
      sendUnauthorized(reply, error)
    }
  }
}

/**
 * Same verification as `createAuthenticateHandler`, plus a `?token=` query
 * fallback when no Authorization header is present (docs/03 §4) — for
 * file-serving GET routes only (`GET /images/:id/file`, `GET /files/*`),
 * never for routes that read a header and mutate state.
 */
export function createAuthenticateAllowingQueryTokenHandler(fastify: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const token = extractBearerToken(request) ?? extractQueryToken(request)
      if (!token) {
        throw new AuthenticationError('Missing Authorization header or token query parameter')
      }
      await verifyAndAttachUser(fastify, request, token)
    } catch (error) {
      sendUnauthorized(reply, error)
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
