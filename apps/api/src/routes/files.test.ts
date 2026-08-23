import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ERROR_CODES } from '@snapscale/shared'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { App } from '@/app.js'

import { buildApp } from '@/app.js'
import * as albumsRepo from '@/repositories/albums.js'
import * as usersRepo from '@/repositories/users.js'
import { createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'
import { buildMultipartPayload, makeColorPng } from '~/test/fixtures.js'

const JWT_SECRET = 'test-files-secret'

interface Envelope<T> {
  readonly success: boolean
  readonly data?: T
}

interface ImageBody {
  readonly id: string
  readonly storagePath: string
}

interface ProcessedImageBody {
  readonly storagePath: string
}

function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@example.com`
}

describe('GET /files/* and query-token auth (docs/03 §4/§7)', () => {
  let database: TestDatabase
  let app: App
  let uploadDir: string
  let ownerId: string
  let intruderId: string
  let ownerToken: string
  let intruderToken: string
  let ownerFileToken: string
  let intruderFileToken: string
  let albumId: string
  let pngBuffer: Buffer

  beforeAll(async () => {
    database = await createTestDatabase()
    pngBuffer = await makeColorPng()
  }, 60_000)

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'snapscale-files-'))
    app = await buildApp({ logger: false, db: database.db, jwtSecret: JWT_SECRET, uploadDir })
    await app.ready()

    await truncateAll(database)
    ownerId = (await usersRepo.upsertByEmail(database.db, uniqueEmail('owner'))).id
    intruderId = (await usersRepo.upsertByEmail(database.db, uniqueEmail('intruder'))).id
    // `scope: 'session'` — full-access tokens, header only (plugins/auth-guard.ts).
    ownerToken = await app.jwt.sign({ sub: ownerId, email: 'owner@example.com', scope: 'session' })
    intruderToken = await app.jwt.sign({ sub: intruderId, email: 'intruder@example.com', scope: 'session' })
    // `scope: 'file'` — the short-lived, read-only tokens `?token=` now requires
    // instead of a session token (the fix for the credential-in-URL finding).
    ownerFileToken = await app.jwt.sign({ sub: ownerId, scope: 'file' })
    intruderFileToken = await app.jwt.sign({ sub: intruderId, scope: 'file' })
    albumId = (await albumsRepo.create(database.db, { ownerId, name: 'Trip' })).id
  })

  afterEach(async () => {
    await app.close()
    await rm(uploadDir, { recursive: true, force: true })
  })

  async function uploadImage(token: string): Promise<ImageBody> {
    const payload = await buildMultipartPayload(
      { albumId },
      { field: 'file', filename: 'sunset.png', contentType: 'image/png', data: pngBuffer },
    )
    const response = await app.inject({
      method: 'POST',
      url: '/images',
      headers: { authorization: `Bearer ${token}`, 'content-type': payload.contentType },
      payload: payload.body,
    })
    const body = (response.json() as Envelope<ImageBody>).data
    if (!body) {
      throw new Error(`fixture upload failed: ${JSON.stringify(response.json())}`)
    }
    return body
  }

  async function processImage(token: string, imageId: string): Promise<ProcessedImageBody> {
    const response = await app.inject({
      method: 'POST',
      url: '/images/process',
      headers: { authorization: `Bearer ${token}` },
      payload: { imageId, width: 16, height: 16, filter: 'none', quality: 80 },
    })
    const body = (response.json() as Envelope<ProcessedImageBody>).data
    if (!body) {
      throw new Error(`fixture process failed: ${JSON.stringify(response.json())}`)
    }
    return body
  }

  it('serves an owned original file via ?token= — the <img>-tag path, no Authorization header sent', async () => {
    const image = await uploadImage(ownerToken)

    const response = await app.inject({ method: 'GET', url: `/files/${image.storagePath}?token=${ownerFileToken}` })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('image/png')
    expect(Buffer.compare(response.rawPayload, pngBuffer)).toBe(0)
  })

  it('serves an owned processed file via ?token=', async () => {
    const image = await uploadImage(ownerToken)
    const processed = await processImage(ownerToken, image.id)

    const response = await app.inject({
      method: 'GET',
      url: `/files/${processed.storagePath}?token=${ownerFileToken}`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('image/png')
  })

  it("rejects fetching another owner's file with a valid session Authorization header — no ownership oracle", async () => {
    const image = await uploadImage(ownerToken)

    const response = await app.inject({
      method: 'GET',
      url: `/files/${image.storagePath}`,
      headers: { authorization: `Bearer ${intruderToken}` },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.NOT_FOUND } })
  })

  it('still accepts a normal Authorization header on /files/* (query token is a fallback, not exclusive)', async () => {
    const image = await uploadImage(ownerToken)

    const response = await app.inject({
      method: 'GET',
      url: `/files/${image.storagePath}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    })

    expect(response.statusCode).toBe(200)
  })

  it('also accepts ?token= on the existing GET /images/:id/file route', async () => {
    const image = await uploadImage(ownerToken)

    const response = await app.inject({ method: 'GET', url: `/images/${image.id}/file?token=${ownerFileToken}` })

    expect(response.statusCode).toBe(200)
    expect(Buffer.compare(response.rawPayload, pngBuffer)).toBe(0)
  })

  it('rejects a tampered query token with 401 UNAUTHORIZED', async () => {
    const image = await uploadImage(ownerToken)
    // Tamper *inside* the signature, never at its last character: a 32-byte
    // HMAC encodes to 43 base64url chars whose final char carries only 2
    // significant bits, so replacing it yields the identical bytes whenever
    // it happened to be `w` — the token stays valid and this test would pass
    // for the wrong reason (measured: 8.1% of 1000 signatures). A
    // mid-signature flip always changes the decoded bytes.
    const [header, payload, signature = ''] = ownerFileToken.split('.')
    const flipped = signature[10] === 'A' ? 'B' : 'A'
    const tampered = `${header}.${payload}.${signature.slice(0, 10)}${flipped}${signature.slice(11)}`

    const response = await app.inject({ method: 'GET', url: `/files/${image.storagePath}?token=${tampered}` })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.UNAUTHORIZED } })
  })

  it('rejects a request with neither an Authorization header nor a ?token= with 401 UNAUTHORIZED', async () => {
    const image = await uploadImage(ownerToken)

    const response = await app.inject({ method: 'GET', url: `/files/${image.storagePath}` })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.UNAUTHORIZED } })
  })

  it("rejects fetching another owner's file even with a valid token — no ownership oracle", async () => {
    const image = await uploadImage(ownerToken)

    const response = await app.inject({
      method: 'GET',
      url: `/files/${image.storagePath}?token=${intruderFileToken}`,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.NOT_FOUND } })
  })

  it('blocks a `../` path traversal attempt with 404, never escaping UPLOAD_DIR', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/files/../../../../../../etc/passwd?token=${ownerFileToken}`,
    })

    expect(response.statusCode).not.toBe(200)
    expect([400, 404]).toContain(response.statusCode)
  })

  it('blocks a percent-encoded `../` traversal attempt with 404, never escaping UPLOAD_DIR', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/files/..%2f..%2f..%2f..%2f..%2f..%2fetc%2fpasswd?token=${ownerFileToken}`,
    })

    expect(response.statusCode).not.toBe(200)
    expect([400, 404]).toContain(response.statusCode)
  })

  // --- FIX-TOKEN: scoped file tokens (docs/03 §4, credential-in-URL finding) ---

  it('rejects a session-scoped token used as ?token= with 401 — the fix for the credential-in-URL finding', async () => {
    const image = await uploadImage(ownerToken)

    const response = await app.inject({ method: 'GET', url: `/files/${image.storagePath}?token=${ownerToken}` })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.UNAUTHORIZED } })
  })

  it('rejects a session-scoped token used as ?token= on GET /images/:id/file with 401', async () => {
    const image = await uploadImage(ownerToken)

    const response = await app.inject({ method: 'GET', url: `/images/${image.id}/file?token=${ownerToken}` })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.UNAUTHORIZED } })
  })

  it('rejects a file-scoped token presented in the Authorization header with 401', async () => {
    const image = await uploadImage(ownerToken)

    const response = await app.inject({
      method: 'GET',
      url: `/files/${image.storagePath}`,
      headers: { authorization: `Bearer ${ownerFileToken}` },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.UNAUTHORIZED } })
  })

  it('rejects an expired file-scoped ?token= with 401', async () => {
    const image = await uploadImage(ownerToken)
    const expiredFileToken = await app.jwt.sign({ sub: ownerId, scope: 'file' }, { expiresIn: '1ms' })
    await new Promise((resolve) => setTimeout(resolve, 10))

    const response = await app.inject({
      method: 'GET',
      url: `/files/${image.storagePath}?token=${expiredFileToken}`,
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.UNAUTHORIZED } })
  })

  // --- caching: file tokens rotate every 60s, the bytes do not ---

  it('serves a file with a private Cache-Control and an ETag', async () => {
    const image = await uploadImage(ownerToken)

    const response = await app.inject({
      method: 'GET',
      url: `/files/${image.storagePath}?token=${ownerFileToken}`,
    })

    expect(response.statusCode).toBe(200)
    // Private: these bytes belong to one account and must never be held by a
    // shared cache. Short: the URL is authorized by a 60s token.
    expect(response.headers['cache-control']).toMatch(/private/)
    expect(response.headers['cache-control']).toMatch(/max-age=\d+/)
    expect(response.headers.etag).toBeDefined()
  })

  it('answers a revalidation carrying the ETag with 304 and no body — a rotated token must not force a re-download', async () => {
    const image = await uploadImage(ownerToken)

    const firstResponse = await app.inject({
      method: 'GET',
      url: `/files/${image.storagePath}?token=${ownerFileToken}`,
    })
    const etag = firstResponse.headers.etag as string

    // A brand-new file token — the exact case the finding describes: the URL
    // changed, the bytes did not.
    const rotatedToken = await app.jwt.sign({ sub: ownerId, scope: 'file' })
    const revalidation = await app.inject({
      method: 'GET',
      url: `/files/${image.storagePath}?token=${rotatedToken}`,
      headers: { 'if-none-match': etag },
    })

    expect(revalidation.statusCode).toBe(304)
    expect(revalidation.rawPayload).toHaveLength(0)
  })

  it('gives the same ETag to two reads of the same unchanged file', async () => {
    const image = await uploadImage(ownerToken)
    const url = `/files/${image.storagePath}?token=${ownerFileToken}`

    const [firstResponse, secondResponse] = await Promise.all([
      app.inject({ method: 'GET', url }),
      app.inject({ method: 'GET', url }),
    ])

    expect(firstResponse.headers.etag).toBe(secondResponse.headers.etag)
  })

  it('answers the 404 envelope — not a half-sent stream — when the row exists but the blob is gone', async () => {
    const image = await uploadImage(ownerToken)
    await rm(join(uploadDir, image.storagePath))

    const response = await app.inject({
      method: 'GET',
      url: `/files/${image.storagePath}?token=${ownerFileToken}`,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.NOT_FOUND } })
  })
})
