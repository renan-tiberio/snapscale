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
import { buildMultipartPayload, makeColorPng } from '~/test/fixtures.js'
import { createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

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
    ownerToken = await app.jwt.sign({ sub: ownerId, email: 'owner@example.com' })
    intruderToken = await app.jwt.sign({ sub: intruderId, email: 'intruder@example.com' })
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
      payload: { imageId, width: 4, height: 4, filter: 'none', quality: 80 },
    })
    const body = (response.json() as Envelope<ProcessedImageBody>).data
    if (!body) {
      throw new Error(`fixture process failed: ${JSON.stringify(response.json())}`)
    }
    return body
  }

  it('serves an owned original file via ?token= — the <img>-tag path, no Authorization header sent', async () => {
    const image = await uploadImage(ownerToken)

    const response = await app.inject({ method: 'GET', url: `/files/${image.storagePath}?token=${ownerToken}` })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('image/png')
    expect(Buffer.compare(response.rawPayload, pngBuffer)).toBe(0)
  })

  it('serves an owned processed file via ?token=', async () => {
    const image = await uploadImage(ownerToken)
    const processed = await processImage(ownerToken, image.id)

    const response = await app.inject({ method: 'GET', url: `/files/${processed.storagePath}?token=${ownerToken}` })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('image/png')
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

    const response = await app.inject({ method: 'GET', url: `/images/${image.id}/file?token=${ownerToken}` })

    expect(response.statusCode).toBe(200)
    expect(Buffer.compare(response.rawPayload, pngBuffer)).toBe(0)
  })

  it('rejects a tampered query token with 401 UNAUTHORIZED', async () => {
    const image = await uploadImage(ownerToken)
    const tampered = `${ownerToken.slice(0, -1)}${ownerToken.endsWith('x') ? 'y' : 'x'}`

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

    const response = await app.inject({ method: 'GET', url: `/files/${image.storagePath}?token=${intruderToken}` })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.NOT_FOUND } })
  })

  it('blocks a `../` path traversal attempt with 404, never escaping UPLOAD_DIR', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/files/../../../../../../etc/passwd?token=${ownerToken}`,
    })

    expect(response.statusCode).not.toBe(200)
    expect([400, 404]).toContain(response.statusCode)
  })

  it('blocks a percent-encoded `../` traversal attempt with 404, never escaping UPLOAD_DIR', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/files/..%2f..%2f..%2f..%2f..%2f..%2fetc%2fpasswd?token=${ownerToken}`,
    })

    expect(response.statusCode).not.toBe(200)
    expect([400, 404]).toContain(response.statusCode)
  })
})
