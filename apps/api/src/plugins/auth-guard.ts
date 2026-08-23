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
 * Augment FastifyInstance to include the authenticate preHandler decorator.
 */
declare module 'fastify' {
  interface FastifyInstance {
    authenticate?: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

/**
 * Creates the authentication preHandler function that verifies JWT Bearer tokens.
 * This function is used as a preHandler on routes that require authentication.
 */
export function createAuthenticateHandler(fastify: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const authHeader = request.headers.authorization

      if (!authHeader) {
        throw new AuthenticationError('Missing Authorization header')
      }

      const parts = authHeader.split(' ')
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        throw new AuthenticationError('Invalid Authorization header format')
      }

      const token = parts[1]
      if (!token) {
        throw new AuthenticationError('Missing token')
      }

      // Verify the JWT using @fastify/jwt
      // This will throw if the token is invalid, expired, or tampered
      const payload = await fastify.jwt.verify(token)

      // Validate and extract user info
      if (typeof payload === 'object' && payload !== null && 'sub' in payload && 'email' in payload) {
        const sub = payload.sub
        const email = payload.email
        if (typeof sub === 'string' && typeof email === 'string') {
          // Attach user to request
          request.user = {
            id: sub,
            email,
          } as unknown as typeof request.user
          return
        }
      }

      throw new AuthenticationError('Invalid token payload')
    } catch (error) {
      if (error instanceof AuthenticationError) {
        reply.code(401).send(fail(ERROR_CODES.UNAUTHORIZED, error.message))
      } else {
        // Any error from JWT verification (invalid, expired, tampered, etc.) is an auth failure
        // Wrap it in AuthenticationError to ensure consistent 401 response
        const message = error instanceof Error ? error.message : 'Invalid or expired token'
        reply.code(401).send(fail(ERROR_CODES.UNAUTHORIZED, message))
      }
    }
  }
}

/**
 * Auth-guard plugin that provides JWT verification via preHandler.
 * Registers the authenticate preHandler on the app instance.
 */
export async function authGuardPlugin(fastify: FastifyInstance): Promise<void> {
  const authenticate = createAuthenticateHandler(fastify)
  ;(fastify as unknown as Record<string, unknown>).authenticate = authenticate
}
