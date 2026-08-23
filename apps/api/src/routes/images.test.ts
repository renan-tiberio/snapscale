import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ERROR_CODES, MAX_UPLOAD_BYTES } from '@snapscale/shared'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { App } from '@/app.js'

import { buildApp } from '@/app.js'
import * as albumsRepo from '@/repositories/albums.js'
import * as usersRepo from '@/repositories/users.js'
import { createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

const JWT_SECRET = 'test-images-secret'

interface Envelope<T> {
  readonly success: boolean
  readonly data?: T
  readonly error?: { readonly code: string; readonly message: string }
}

interface ImageBody {
  readonly id: string
  readonly albumId: string
  readonly ownerId: string
  readonly storagePath: string
  readonly mimeType: string
  readonly sizeBytes: number
}

function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@example.com`
}

/** Builds a real multipart/form-data request body using Node/undici globals — no extra dependency needed. */
async function buildMultipartPayload(
  fields: Record<string, string>,
  file?: { field: string; filename: string; contentType: string; data: Buffer },
): Promise<{ contentType: string; body: Buffer }> {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value)
  }
  if (file) {
    form.append(file.field, new Blob([file.data], { type: file.contentType }), file.filename)
  }

  const request = new Request('http://localhost/upload', { method: 'POST', body: form })
  const contentType = request.headers.get('content-type')
  if (!contentType) {
    throw new Error('expected multipart content-type to be set by FormData/Request')
  }

  return { contentType, body: Buffer.from(await request.arrayBuffer()) }
}

async function makePng(): Promise<Buffer> {
  return sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } }).png().toBuffer()
}

describe('image routes (/images)', () => {
  let database: TestDatabase
  let app: App
  let uploadDir: string
  let ownerId: string
  let intruderId: string
  let ownerToken: string
  let intruderToken: string
  let albumId: string
  let intruderAlbumId: string
  let pngBuffer: Buffer

  beforeAll(async () => {
    database = await createTestDatabase()
    pngBuffer = await makePng()
  }, 60_000)

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'snapscale-uploads-'))
    app = await buildApp({ logger: false, db: database.db, jwtSecret: JWT_SECRET, uploadDir })
    await app.ready()

    await truncateAll(database)
    ownerId = (await usersRepo.upsertByEmail(database.db, uniqueEmail('owner'))).id
    intruderId = (await usersRepo.upsertByEmail(database.db, uniqueEmail('intruder'))).id
    // `scope: 'session'` — the header guard now requires it explicitly (plugins/auth-guard.ts).
    ownerToken = await app.jwt.sign({ sub: ownerId, email: 'owner@example.com', scope: 'session' })
    intruderToken = await app.jwt.sign({ sub: intruderId, email: 'intruder@example.com', scope: 'session' })
    albumId = (await albumsRepo.create(database.db, { ownerId, name: 'Trip' })).id
    intruderAlbumId = (await albumsRepo.create(database.db, { ownerId: intruderId, name: 'Their trip' })).id
  })

  afterEach(async () => {
    await app.close()
    await rm(uploadDir, { recursive: true, force: true })
  })

  function authHeader(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` }
  }

  async function upload(
    token: string,
    fields: Record<string, string>,
    file?: { filename: string; contentType: string; data: Buffer },
  ) {
    const payload = await buildMultipartPayload(
      fields,
      file ? { field: 'file', filename: file.filename, contentType: file.contentType, data: file.data } : undefined,
    )

    return app.inject({
      method: 'POST',
      url: '/images',
      headers: { ...authHeader(token), 'content-type': payload.contentType },
      payload: payload.body,
    })
  }

  it('uploads a valid image: returns the image entity, persists the row, and writes the file to disk', async () => {
    const response = await upload(
      ownerToken,
      { albumId },
      { filename: 'sunset.png', contentType: 'image/png', data: pngBuffer },
    )

    expect(response.statusCode).toBe(200)
    const body = response.json() as Envelope<ImageBody>
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({
      albumId,
      ownerId,
      mimeType: 'image/png',
      sizeBytes: pngBuffer.byteLength,
    })

    const imageId = body.data?.id ?? ''
    const row = await database.pool.query('select * from images where id = $1', [imageId])
    expect(row.rows).toHaveLength(1)
    expect(row.rows[0]).toMatchObject({ album_id: albumId, owner_id: ownerId, width: 4, height: 4 })

    const storagePath = body.data?.storagePath ?? ''
    const stats = await stat(join(uploadDir, storagePath))
    expect(stats.isFile()).toBe(true)
  })

  it('rejects an upload to another owner\'s album with 404 NOT_FOUND — no ownership oracle', async () => {
    const response = await upload(
      ownerToken,
      { albumId: intruderAlbumId },
      { filename: 'sunset.png', contentType: 'image/png', data: pngBuffer },
    )

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.NOT_FOUND } })
  })

  it('rejects an upload to an unknown album with 404 NOT_FOUND', async () => {
    const response = await upload(
      ownerToken,
      { albumId: randomUUID() },
      { filename: 'sunset.png', contentType: 'image/png', data: pngBuffer },
    )

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.NOT_FOUND } })
  })

  it('rejects an oversize upload with 422 VALIDATION_ERROR', async () => {
    const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1024, 1)

    const response = await upload(
      ownerToken,
      { albumId },
      { filename: 'huge.png', contentType: 'image/png', data: oversized },
    )

    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.VALIDATION_ERROR } })
  })

  it('rejects a disallowed mime type with 422 VALIDATION_ERROR', async () => {
    const response = await upload(
      ownerToken,
      { albumId },
      { filename: 'doc.pdf', contentType: 'application/pdf', data: pngBuffer },
    )

    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.VALIDATION_ERROR } })
  })

  it('rejects a valid mime header whose content is not actually an image — magic-byte check via sharp', async () => {
    const notAnImage = Buffer.from('this is definitely not image bytes, just plain text', 'utf8')

    const response = await upload(
      ownerToken,
      { albumId },
      { filename: 'fake.jpg', contentType: 'image/jpeg', data: notAnImage },
    )

    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.VALIDATION_ERROR } })

    const count = await database.pool.query('select count(*)::text from images')
    expect(count.rows[0]?.count).toBe('0')
  })

  it('rejects an SVG uploaded with a spoofed allowed mime header — format must match jpeg/png/webp, not just "parses as some image"', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
      'utf8',
    )

    const response = await upload(
      ownerToken,
      { albumId },
      { filename: 'sneaky.png', contentType: 'image/png', data: svg },
    )

    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.VALIDATION_ERROR } })

    const count = await database.pool.query('select count(*)::text from images')
    expect(count.rows[0]?.count).toBe('0')
  })

  it('lists only the images of my own album', async () => {
    await upload(ownerToken, { albumId }, { filename: 'a.png', contentType: 'image/png', data: pngBuffer })
    await upload(ownerToken, { albumId }, { filename: 'b.png', contentType: 'image/png', data: pngBuffer })

    const response = await app.inject({
      method: 'GET',
      url: `/images?albumId=${albumId}`,
      headers: authHeader(ownerToken),
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as Envelope<ImageBody[]>
    expect(body.data).toHaveLength(2)
  })

  it("rejects listing another owner's album images with 404 NOT_FOUND", async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/images?albumId=${intruderAlbumId}`,
      headers: authHeader(ownerToken),
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.NOT_FOUND } })
  })

  it('serves the exact original bytes with the correct content-type at GET /images/:id/file', async () => {
    const uploadResponse = await upload(
      ownerToken,
      { albumId },
      { filename: 'sunset.png', contentType: 'image/png', data: pngBuffer },
    )
    const imageId = (uploadResponse.json() as Envelope<ImageBody>).data?.id ?? ''

    const response = await app.inject({
      method: 'GET',
      url: `/images/${imageId}/file`,
      headers: authHeader(ownerToken),
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('image/png')
    expect(Buffer.compare(response.rawPayload, pngBuffer)).toBe(0)
  })

  it("rejects fetching another owner's image file with 404 NOT_FOUND — no ownership oracle", async () => {
    const uploadResponse = await upload(
      ownerToken,
      { albumId },
      { filename: 'sunset.png', contentType: 'image/png', data: pngBuffer },
    )
    const imageId = (uploadResponse.json() as Envelope<ImageBody>).data?.id ?? ''

    const response = await app.inject({
      method: 'GET',
      url: `/images/${imageId}/file`,
      headers: authHeader(intruderToken),
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.NOT_FOUND } })
  })

  it('rejects fetching an unknown image id with 404 NOT_FOUND', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/images/${randomUUID()}/file`,
      headers: authHeader(ownerToken),
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.NOT_FOUND } })
  })

  it('rejects every image route without a token with 401 UNAUTHORIZED', async () => {
    const uploadResponse = await upload(
      ownerToken,
      { albumId },
      { filename: 'sunset.png', contentType: 'image/png', data: pngBuffer },
    )
    const imageId = (uploadResponse.json() as Envelope<ImageBody>).data?.id ?? ''

    const payload = await buildMultipartPayload(
      { albumId },
      { field: 'file', filename: 'sunset.png', contentType: 'image/png', data: pngBuffer },
    )

    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/images', headers: { 'content-type': payload.contentType }, payload: payload.body }),
      app.inject({ method: 'GET', url: `/images?albumId=${albumId}` }),
      app.inject({ method: 'GET', url: `/images/${imageId}/file` }),
    ])

    for (const response of responses) {
      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.UNAUTHORIZED } })
    }
  })

  it('answers the 404 envelope when the image row exists but its blob is gone from disk', async () => {
    const uploaded = (
      await upload(ownerToken, { albumId }, { filename: 'sunset.png', contentType: 'image/png', data: pngBuffer })
    ).json() as Envelope<ImageBody>
    await rm(join(uploadDir, uploaded.data?.storagePath ?? ''))

    const response = await app.inject({
      method: 'GET',
      url: `/images/${uploaded.data?.id ?? ''}/file`,
      headers: authHeader(ownerToken),
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.NOT_FOUND } })
  })

  it('serves GET /images/:id/file with a private Cache-Control and an ETag that revalidates to 304', async () => {
    const uploaded = (
      await upload(ownerToken, { albumId }, { filename: 'sunset.png', contentType: 'image/png', data: pngBuffer })
    ).json() as Envelope<ImageBody>
    const url = `/images/${uploaded.data?.id ?? ''}/file`

    const first = await app.inject({ method: 'GET', url, headers: authHeader(ownerToken) })
    expect(first.headers['cache-control']).toMatch(/private/)
    expect(first.headers.etag).toBeDefined()

    const revalidation = await app.inject({
      method: 'GET',
      url,
      headers: { ...authHeader(ownerToken), 'if-none-match': first.headers.etag as string },
    })

    expect(revalidation.statusCode).toBe(304)
    expect(revalidation.rawPayload).toHaveLength(0)
  })

  it('surfaces a row whose mime_type is outside the allowlist as a 500, never as a typed lie', async () => {
    // `images.mime_type` is a plain `text` column: only the upload route
    // enforces the allowlist. A row written by anything else (a migration, a
    // future importer) would otherwise be cast straight to
    // `AllowedImageMimeType` and served to the client as if it were valid.
    const uploaded = (
      await upload(ownerToken, { albumId }, { filename: 'sunset.png', contentType: 'image/png', data: pngBuffer })
    ).json() as Envelope<ImageBody>
    await database.pool.query(`update images set mime_type = 'application/pdf' where id = $1`, [
      uploaded.data?.id,
    ])

    const response = await app.inject({
      method: 'GET',
      url: `/images/${uploaded.data?.id ?? ''}`,
      headers: authHeader(ownerToken),
    })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.INTERNAL } })
  })

  // --- GET /images/:id — the entity, not the file (docs/03 §4) ---

  it('gets one of the caller\'s images by id — the metadata entity, not the bytes', async () => {
    const uploaded = (
      await upload(ownerToken, { albumId }, { filename: 'sunset.png', contentType: 'image/png', data: pngBuffer })
    ).json() as Envelope<ImageBody>
    const imageId = uploaded.data?.id ?? ''

    const response = await app.inject({
      method: 'GET',
      url: `/images/${imageId}`,
      headers: authHeader(ownerToken),
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('application/json')
    const body = response.json() as Envelope<ImageBody>
    expect(body.data).toMatchObject({ id: imageId, albumId, ownerId, mimeType: 'image/png' })
  })

  it("returns 404 NOT_FOUND for another owner's image id on GET /images/:id", async () => {
    const uploaded = (
      await upload(ownerToken, { albumId }, { filename: 'sunset.png', contentType: 'image/png', data: pngBuffer })
    ).json() as Envelope<ImageBody>

    const response = await app.inject({
      method: 'GET',
      url: `/images/${uploaded.data?.id ?? ''}`,
      headers: authHeader(intruderToken),
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.NOT_FOUND } })
  })

  it('returns 404 NOT_FOUND for an unknown image id on GET /images/:id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/images/${randomUUID()}`,
      headers: authHeader(ownerToken),
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.NOT_FOUND } })
  })

  it('rejects GET /images/:id without a token with 401 UNAUTHORIZED', async () => {
    const response = await app.inject({ method: 'GET', url: `/images/${randomUUID()}` })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.UNAUTHORIZED } })
  })

  it('documents GET /images/{id} at /docs/json', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' })
    const document = response.json() as { paths: Record<string, unknown> }

    expect(document.paths).toHaveProperty('/images/{id}')
  })

  it('documents the multipart `file` and `albumId` fields of POST /images at /docs/json', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' })
    const document = response.json() as {
      paths: Record<
        string,
        {
          post?: {
            requestBody?: {
              content?: Record<string, { schema?: { properties?: Record<string, unknown> } }>
            }
          }
        }
      >
    }

    const properties =
      document.paths['/images']?.post?.requestBody?.content?.['multipart/form-data']?.schema?.properties

    expect(properties).toHaveProperty('file')
    expect(properties).toHaveProperty('albumId')
  })

  it('documents image routes at /docs/json', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' })
    const document = response.json() as { paths: Record<string, unknown> }

    expect(document.paths).toHaveProperty('/images')
    expect(document.paths).toHaveProperty('/images/{id}/file')
  })
})
