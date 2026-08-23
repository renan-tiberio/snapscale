import { randomUUID } from 'node:crypto'

import { ERROR_CODES } from '@snapscale/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { App } from '@/app.js'

import { buildApp } from '@/app.js'
import * as usersRepo from '@/repositories/users.js'
import { createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

const JWT_SECRET = 'test-albums-secret'

interface Envelope<T> {
  readonly success: boolean
  readonly data?: T
  readonly error?: { readonly code: string; readonly message: string }
}

interface AlbumBody {
  readonly id: string
  readonly userId: string
  readonly name: string
  readonly description?: string | null
}

function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@example.com`
}

describe('album routes (/albums)', () => {
  let database: TestDatabase
  let app: App
  let ownerId: string
  let intruderId: string
  let ownerToken: string
  let intruderToken: string

  beforeAll(async () => {
    database = await createTestDatabase()
    app = await buildApp({ logger: false, db: database.db, jwtSecret: JWT_SECRET })
    await app.ready()
  }, 60_000)

  afterAll(async () => {
    await app.close()
    await database.destroy()
  })

  beforeEach(async () => {
    await truncateAll(database)
    ownerId = (await usersRepo.upsertByEmail(database.db, uniqueEmail('owner'))).id
    intruderId = (await usersRepo.upsertByEmail(database.db, uniqueEmail('intruder'))).id
    ownerToken = await app.jwt.sign({ sub: ownerId, email: 'owner@example.com' })
    intruderToken = await app.jwt.sign({ sub: intruderId, email: 'intruder@example.com' })
  })

  function authHeader(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` }
  }

  async function createAlbum(token: string, body: { name: string; description?: string }) {
    return app.inject({ method: 'POST', url: '/albums', headers: authHeader(token), payload: body })
  }

  it('creates an album for the authenticated user and scopes it to their id', async () => {
    const response = await createAlbum(ownerToken, { name: 'Trip', description: 'Summer trip' })

    expect(response.statusCode).toBe(200)
    const body = response.json() as Envelope<AlbumBody>
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ name: 'Trip', description: 'Summer trip', userId: ownerId })
  })

  it('lists only the authenticated user\'s albums', async () => {
    await createAlbum(ownerToken, { name: 'Mine' })
    await createAlbum(intruderToken, { name: 'Theirs' })

    const response = await app.inject({ method: 'GET', url: '/albums', headers: authHeader(ownerToken) })

    expect(response.statusCode).toBe(200)
    const body = response.json() as Envelope<AlbumBody[]>
    expect(body.data?.map((album) => album.name)).toEqual(['Mine'])
  })

  it('gets an album owned by the authenticated user', async () => {
    const created = (await createAlbum(ownerToken, { name: 'Solo' })).json() as Envelope<AlbumBody>
    const id = created.data?.id ?? ''

    const response = await app.inject({ method: 'GET', url: `/albums/${id}`, headers: authHeader(ownerToken) })

    expect(response.statusCode).toBe(200)
    expect((response.json() as Envelope<AlbumBody>).data?.id).toBe(id)
  })

  it("returns 404 NOT_FOUND for another owner's album on GET, PATCH, and DELETE — no ownership oracle", async () => {
    const created = (await createAlbum(ownerToken, { name: 'Private' })).json() as Envelope<AlbumBody>
    const id = created.data?.id ?? ''

    const [getResponse, patchResponse, deleteResponse] = await Promise.all([
      app.inject({ method: 'GET', url: `/albums/${id}`, headers: authHeader(intruderToken) }),
      app.inject({
        method: 'PATCH',
        url: `/albums/${id}`,
        headers: authHeader(intruderToken),
        payload: { name: 'Stolen' },
      }),
      app.inject({ method: 'DELETE', url: `/albums/${id}`, headers: authHeader(intruderToken) }),
    ])

    for (const response of [getResponse, patchResponse, deleteResponse]) {
      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.NOT_FOUND } })
    }

    // The album must still exist, untouched, for its real owner.
    const stillThere = await app.inject({ method: 'GET', url: `/albums/${id}`, headers: authHeader(ownerToken) })
    expect(stillThere.statusCode).toBe(200)
    expect((stillThere.json() as Envelope<AlbumBody>).data?.name).toBe('Private')
  })

  it('updates the album name/description for the owner', async () => {
    const created = (await createAlbum(ownerToken, { name: 'Old', description: 'old' })).json() as Envelope<AlbumBody>
    const id = created.data?.id ?? ''

    const response = await app.inject({
      method: 'PATCH',
      url: `/albums/${id}`,
      headers: authHeader(ownerToken),
      payload: { name: 'New' },
    })

    expect(response.statusCode).toBe(200)
    expect((response.json() as Envelope<AlbumBody>).data).toMatchObject({ name: 'New', description: 'old' })
  })

  it('deletes the album for the owner, which then 404s on subsequent get', async () => {
    const created = (await createAlbum(ownerToken, { name: 'Doomed' })).json() as Envelope<AlbumBody>
    const id = created.data?.id ?? ''

    const deleteResponse = await app.inject({ method: 'DELETE', url: `/albums/${id}`, headers: authHeader(ownerToken) })
    expect(deleteResponse.statusCode).toBe(200)
    expect((deleteResponse.json() as Envelope<Record<string, never>>).success).toBe(true)

    const getResponse = await app.inject({ method: 'GET', url: `/albums/${id}`, headers: authHeader(ownerToken) })
    expect(getResponse.statusCode).toBe(404)
  })

  it('rejects every album route without a token with 401 UNAUTHORIZED', async () => {
    const created = (await createAlbum(ownerToken, { name: 'Guarded' })).json() as Envelope<AlbumBody>
    const id = created.data?.id ?? ''

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/albums' }),
      app.inject({ method: 'POST', url: '/albums', payload: { name: 'x' } }),
      app.inject({ method: 'GET', url: `/albums/${id}` }),
      app.inject({ method: 'PATCH', url: `/albums/${id}`, payload: { name: 'x' } }),
      app.inject({ method: 'DELETE', url: `/albums/${id}` }),
    ])

    for (const response of responses) {
      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.UNAUTHORIZED } })
    }
  })

  it('rejects a malformed create body with 422 VALIDATION_ERROR', async () => {
    const response = await createAlbum(ownerToken, { name: '' })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.VALIDATION_ERROR } })
  })

  it('rejects an unknown album id with 404 NOT_FOUND', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/albums/${randomUUID()}`,
      headers: authHeader(ownerToken),
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.NOT_FOUND } })
  })

  it('documents album routes at /docs/json', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' })
    const document = response.json() as { paths: Record<string, unknown> }

    expect(document.paths).toHaveProperty('/albums')
    expect(document.paths).toHaveProperty('/albums/{id}')
  })
})
