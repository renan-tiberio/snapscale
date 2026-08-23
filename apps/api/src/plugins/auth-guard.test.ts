import { ERROR_CODES, ok } from '@snapscale/shared'
import { describe, expect, it } from 'vitest'

import { buildApp } from '@/app.js'

const JWT_SECRET = 'test-auth-guard-secret'

describe('auth-guard plugin', () => {
  it('responds 401 UNAUTHORIZED when Authorization header is missing', async () => {
    const app = await buildApp({ logger: false, jwtSecret: JWT_SECRET })
    const authenticate = app.authenticate
    if (!authenticate) throw new Error('authenticate not initialized')
    app.get('/protected', { preHandler: authenticate }, async (request) => {
      const user = request.user as { id?: string }
      return { userId: user.id || '' }
    })
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/protected' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.UNAUTHORIZED },
    })

    await app.close()
  })

  it('responds 401 UNAUTHORIZED when Authorization header is malformed (not Bearer)', async () => {
    const app = await buildApp({ logger: false, jwtSecret: JWT_SECRET })
    const authenticate = app.authenticate
    if (!authenticate) throw new Error('authenticate not initialized')
    app.get('/protected', { preHandler: authenticate }, async (request) => {
      const user = request.user as { id?: string }
      return { userId: user.id || '' }
    })
    await app.ready()

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

    await app.close()
  })

  it('responds 401 UNAUTHORIZED when Bearer token has tampered signature', async () => {
    const app = await buildApp({ logger: false, jwtSecret: JWT_SECRET })
    const authenticate = app.authenticate
    if (!authenticate) throw new Error('authenticate not initialized')
    app.get('/protected', { preHandler: authenticate }, async (request) => {
      const user = request.user as { id?: string }
      return { userId: user.id || '' }
    })
    await app.ready()

    // Create a valid token, then tamper with it
    const validToken = await app.jwt.sign({ sub: 'user-123', email: 'user@example.com' })
    const tamperedToken = validToken.slice(0, -5) + 'xxxxx'

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

    await app.close()
  })

  it('responds 401 UNAUTHORIZED when Bearer token is expired', async () => {
    const app = await buildApp({ logger: false, jwtSecret: JWT_SECRET })
    const authenticate = app.authenticate
    if (!authenticate) throw new Error('authenticate not initialized')
    app.get('/protected', { preHandler: authenticate }, async (request) => {
      const user = request.user as { id?: string }
      return { userId: user.id || '' }
    })
    await app.ready()

    // Create an expired token by signing with expiresIn: 1ms, then waiting
    const expiredToken = await app.jwt.sign(
      { sub: 'user-123', email: 'user@example.com' },
      { expiresIn: '1ms' }
    )
    await new Promise((resolve) => setTimeout(resolve, 10))

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

    await app.close()
  })

  it('responds 200 and attaches request.user when Bearer token is valid', async () => {
    const app = await buildApp({ logger: false, jwtSecret: JWT_SECRET })
    const authenticate = app.authenticate
    if (!authenticate) throw new Error('authenticate is not defined')
    app.get('/protected', { preHandler: authenticate }, async (request) => {
      const user = request.user as { id?: string; email?: string }
      return ok({ userId: user.id || '', email: user.email || '' })
    })
    await app.ready()

    const validToken = await app.jwt.sign({ sub: 'user-123', email: 'user@example.com' })

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as { success: boolean; data?: { userId: string; email: string } }
    expect(body.success).toBe(true)
    expect(body.data?.userId).toBe('user-123')
    expect(body.data?.email).toBe('user@example.com')

    await app.close()
  })

  it('responds 200 and attaches request.user when Bearer token is valid from auth/otp/verify flow', async () => {
    const app = await buildApp({ logger: false, jwtSecret: JWT_SECRET })
    const authenticate = app.authenticate
    if (!authenticate) throw new Error('authenticate is not defined')
    app.get('/protected', { preHandler: authenticate }, async (request) => {
      const user = request.user as { id?: string; email?: string }
      return ok({ userId: user.id || '', email: user.email || '' })
    })
    await app.ready()

    // Simulate the token from auth routes using the same secret
    const token = await app.jwt.sign({ sub: 'user-456', email: 'authed@example.com' })

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as { success: boolean; data?: { userId: string; email: string } }
    expect(body.success).toBe(true)
    expect(body.data?.userId).toBe('user-456')
    expect(body.data?.email).toBe('authed@example.com')

    await app.close()
  })
})
