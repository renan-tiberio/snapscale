import { randomUUID } from 'node:crypto'

import { Email, ERROR_CODES } from '@snapscale/shared'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { App } from '@/app/index.js'

import { buildApp } from '@/app/index.js'
import * as usersRepo from '@/repositories/users/index.js'
import { createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

/**
 * A token is only a claim: if the account behind it is gone the answer has to be a 404, not a
 * user assembled from the token's own payload.
 */

const JWT_SECRET = 'test-me-secret'

type Envelope<T> = {
  readonly success: boolean
  readonly data?: T
  readonly error?: { readonly code: string; readonly message: string }
}

type MeBody = {
  readonly user: { readonly id: string; readonly email: string; readonly createdAt: string }
}

const uniqueEmail = (): Email => new Email(`me-${randomUUID()}@example.com`)

describe('GET /auth/me', () => {
  let database: TestDatabase
  let app: App
  let userId: string
  let email: Email
  let token: string

  beforeAll(async () => {
    database = await createTestDatabase()
  }, 60_000)

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    app = await buildApp({ logger: false, db: database.db, jwtSecret: JWT_SECRET })
    await app.ready()

    await truncateAll({ handle: database })
    email = uniqueEmail()
    userId = (await usersRepo.upsertByEmail({ db: database.db, email })).id
    token = await app.jwt.sign({ sub: userId, email: email.value, scope: 'session' })
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns the authenticated user read back from the database', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as Envelope<MeBody>
    expect(body.success).toBe(true)
    expect(body.data?.user).toMatchObject({ id: userId, email: email.value })
    expect(Date.parse(body.data?.user.createdAt ?? '')).not.toBeNaN()
  })

  it('reads the user from the database, not from the token payload', async () => {
    // A token whose `email` claim disagrees with the stored row: the answer must be the row,
    // otherwise the route validates nothing.
    const staleToken = await app.jwt.sign({
      sub: userId,
      email: 'stale@example.com',
      scope: 'session',
    })

    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${staleToken}` },
    })

    expect(response.statusCode).toBe(200)
    expect((response.json() as Envelope<MeBody>).data?.user.email).toBe(email.value)
  })

  it('returns 404 NOT_FOUND when the account behind a still-valid token is gone', async () => {
    await database.pool.query('delete from users where id = $1', [userId])

    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND },
    })
  })

  it('rejects a request without a token with 401 UNAUTHORIZED', async () => {
    const response = await app.inject({ method: 'GET', url: '/auth/me' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.UNAUTHORIZED },
    })
  })

  it('rejects a `scope: "file"` token — /auth/me is not a file-serving route', async () => {
    const fileToken = await app.jwt.sign({ sub: userId, scope: 'file' })

    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${fileToken}` },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.UNAUTHORIZED },
    })
  })

  it('documents /auth/me at /docs/json', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' })
    const document = response.json() as { paths: Record<string, unknown> }

    expect(document.paths).toHaveProperty('/auth/me')
  })
})
