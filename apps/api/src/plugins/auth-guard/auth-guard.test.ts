import { ERROR_CODES, ok, type ApiResponse } from '@snapscale/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { App } from '@/app/index.js'

import { buildApp } from '@/app/index.js'

const JWT_SECRET = 'test-auth-guard-secret'
const EXPIRED_TOKEN_SETTLE_MS = 10

type GuardedBody = {
  readonly userId: string
  readonly email: string
}

describe('auth-guard plugin', () => {
  let app: App

  beforeEach(async () => {
    app = await buildApp({ logger: false, jwtSecret: JWT_SECRET })

    const authenticate = app.authenticate
    const authenticateAllowingQueryToken = app.authenticateAllowingQueryToken
    if (!authenticate || !authenticateAllowingQueryToken) {
      throw new Error('buildApp did not register the auth guards')
    }

    app.get('/protected', { preHandler: authenticate }, async (request) =>
      ok({ data: { userId: request.user.id, email: request.user.email } }),
    )
    app.get('/protected-file', { preHandler: authenticateAllowingQueryToken }, async (request) =>
      ok({ data: { userId: request.user.id, email: request.user.email } }),
    )

    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('responds 401 UNAUTHORIZED when Authorization header is missing', async () => {
    const response = await app.inject({ method: 'GET', url: '/protected' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.UNAUTHORIZED },
    })
  })

  it('responds 401 UNAUTHORIZED when Authorization header is malformed (not Bearer)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.UNAUTHORIZED },
    })
  })

  it('responds 401 UNAUTHORIZED when Bearer token has tampered signature', async () => {
    const validToken = await app.jwt.sign({
      sub: 'user-123',
      email: 'user@example.com',
      scope: 'session',
    })
    const tamperedToken = `${validToken.slice(0, -5)}xxxxx`

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${tamperedToken}` },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.UNAUTHORIZED },
    })
  })

  it('responds 401 UNAUTHORIZED when Bearer token is expired', async () => {
    const expiredToken = await app.jwt.sign(
      { sub: 'user-123', email: 'user@example.com', scope: 'session' },
      { expiresIn: '1ms' },
    )
    await new Promise((resolve) => setTimeout(resolve, EXPIRED_TOKEN_SETTLE_MS))

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${expiredToken}` },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.UNAUTHORIZED },
    })
  })

  it('responds 200 and attaches request.user when Bearer token is valid', async () => {
    const validToken = await app.jwt.sign({
      sub: 'user-123',
      email: 'user@example.com',
      scope: 'session',
    })

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as ApiResponse<GuardedBody>
    expect(body.success).toBe(true)
    expect(body.data?.userId).toBe('user-123')
    expect(body.data?.email).toBe('user@example.com')
  })

  it('responds 200 and attaches request.user when Bearer token is valid from auth/otp/verify flow', async () => {
    const token = await app.jwt.sign({
      sub: 'user-456',
      email: 'authed@example.com',
      scope: 'session',
    })

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as ApiResponse<GuardedBody>
    expect(body.success).toBe(true)
    expect(body.data?.userId).toBe('user-456')
    expect(body.data?.email).toBe('authed@example.com')
  })

  it('responds 401 UNAUTHORIZED when a `scope: "file"` token is presented in the Authorization header', async () => {
    const fileToken = await app.jwt.sign({ sub: 'user-123', scope: 'file' })

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${fileToken}` },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.UNAUTHORIZED },
    })
  })

  it('responds 401 UNAUTHORIZED when authenticateAllowingQueryToken receives a `scope: "session"` token as ?token=', async () => {
    const sessionToken = await app.jwt.sign({
      sub: 'user-123',
      email: 'user@example.com',
      scope: 'session',
    })

    const response = await app.inject({
      method: 'GET',
      url: `/protected-file?token=${sessionToken}`,
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.UNAUTHORIZED },
    })
  })

  it('responds 200 when authenticateAllowingQueryToken receives a valid `scope: "file"` token as ?token=', async () => {
    const fileToken = await app.jwt.sign({ sub: 'user-123', scope: 'file' })

    const response = await app.inject({ method: 'GET', url: `/protected-file?token=${fileToken}` })

    expect(response.statusCode).toBe(200)
    const body = response.json() as ApiResponse<GuardedBody>
    expect(body.data?.userId).toBe('user-123')
  })

  it('does not leak the raw @fastify/jwt error text into the 401 body for an expired token', async () => {
    const expiredToken = await app.jwt.sign(
      { sub: 'user-123', scope: 'session' },
      { expiresIn: '1ms' },
    )
    await new Promise((resolve) => setTimeout(resolve, EXPIRED_TOKEN_SETTLE_MS))

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${expiredToken}` },
    })

    expect(response.statusCode).toBe(401)
    const body = response.json() as ApiResponse<never>
    expect(body.error?.message).toBe('Invalid or expired token')
    expect(body.error?.message.toLowerCase()).not.toContain('jwt')
  })
})
