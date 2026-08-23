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
    // `scope: 'session'` — the header guard now requires it explicitly (plugins/auth-guard.ts).
    ownerToken = await app.jwt.sign({ sub: ownerId, email: 'owner@example.com', scope: 'session' })
    intruderToken = await app.jwt.sign({ sub: intruderId, email: 'intruder@example.com', scope: 'session' })
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

  // --- GET /albums?page&limit (docs/03 §4: `meta { total, page, limit }`) ---

  async function createAlbums(count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      const created = await createAlbum(ownerToken, { name: `album-${index}` })
      expect(created.statusCode).toBe(200)
      // Distinct `created_at` values so the newest-first page split is
      // deterministic rather than dependent on insert timing.
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
  }

  interface PagedEnvelope {
    readonly data?: readonly AlbumBody[]
    readonly meta?: { readonly total: number; readonly page: number; readonly limit: number }
  }

  it('carries meta { total, page, limit } on an unpaginated list', async () => {
    await createAlbums(3)

    const response = await app.inject({ method: 'GET', url: '/albums', headers: authHeader(ownerToken) })

    expect(response.statusCode).toBe(200)
    const body = response.json() as PagedEnvelope
    expect(body.data).toHaveLength(3)
    expect(body.meta).toEqual({ total: 3, page: 1, limit: 20 })
  })

  it('splits the list across pages without repeating or skipping an album', async () => {
    await createAlbums(5)

    const firstPage = (
      await app.inject({ method: 'GET', url: '/albums?page=1&limit=2', headers: authHeader(ownerToken) })
    ).json() as PagedEnvelope
    const lastPage = (
      await app.inject({ method: 'GET', url: '/albums?page=3&limit=2', headers: authHeader(ownerToken) })
    ).json() as PagedEnvelope

    expect(firstPage.data?.map((album) => album.name)).toEqual(['album-4', 'album-3'])
    expect(firstPage.meta).toEqual({ total: 5, page: 1, limit: 2 })
    expect(lastPage.data?.map((album) => album.name)).toEqual(['album-0'])
    expect(lastPage.meta).toEqual({ total: 5, page: 3, limit: 2 })
  })

  it('returns an empty page past the end while still reporting the real total', async () => {
    await createAlbums(2)

    const response = await app.inject({
      method: 'GET',
      url: '/albums?page=9&limit=2',
      headers: authHeader(ownerToken),
    })

    const body = response.json() as PagedEnvelope
    expect(response.statusCode).toBe(200)
    expect(body.data).toEqual([])
    expect(body.meta).toEqual({ total: 2, page: 9, limit: 2 })
  })

  it('counts only the caller\'s albums in meta.total', async () => {
    await createAlbums(2)
    await createAlbum(intruderToken, { name: 'theirs' })

    const body = (
      await app.inject({ method: 'GET', url: '/albums', headers: authHeader(ownerToken) })
    ).json() as PagedEnvelope

    expect(body.meta?.total).toBe(2)
  })

  it.each([
    ['?limit=1000', 'a limit above the cap'],
    ['?page=0', 'a zero page'],
    ['?limit=0', 'a zero limit'],
    ['?page=abc', 'a non-numeric page'],
  ])('rejects %s (%s) with 422 VALIDATION_ERROR', async (query) => {
    const response = await app.inject({
      method: 'GET',
      url: `/albums${query}`,
      headers: authHeader(ownerToken),
    })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.VALIDATION_ERROR } })
  })

  it('documents album routes at /docs/json', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' })
    const document = response.json() as { paths: Record<string, unknown> }

    expect(document.paths).toHaveProperty('/albums')
    expect(document.paths).toHaveProperty('/albums/{id}')
  })
})
