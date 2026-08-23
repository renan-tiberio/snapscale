import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ERROR_CODES } from '@snapscale/shared'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { App } from '@/app.js'

import { buildApp } from '@/app.js'
import * as albumsRepo from '@/repositories/albums.js'
import * as usersRepo from '@/repositories/users.js'
import { createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'
import { buildMultipartPayload, makeColorPng, makeNoiseJpeg, makeTwoToneColorPng } from '~/test/fixtures.js'

const JWT_SECRET = 'test-images-process-secret'

interface Envelope<T> {
  readonly success: boolean
  readonly data?: T
  readonly error?: { readonly code: string; readonly message: string }
}

interface ProcessedImageBody {
  readonly id: string
  readonly imageId: string
  readonly storagePath: string
  readonly durationMs: number
  readonly params: { readonly width: number; readonly height: number; readonly filter: string; readonly quality: number }
}

function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@example.com`
}

describe('POST /images/process (docs/03 §4 — the heavy route)', () => {
  let database: TestDatabase
  let app: App
  let uploadDir: string
  let ownerId: string
  let intruderId: string
  let ownerToken: string
  let intruderToken: string
  let albumId: string

  beforeAll(async () => {
    database = await createTestDatabase()
  }, 60_000)

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'snapscale-process-'))
    app = await buildApp({ logger: false, db: database.db, jwtSecret: JWT_SECRET, uploadDir })
    await app.ready()

    await truncateAll(database)
    ownerId = (await usersRepo.upsertByEmail(database.db, uniqueEmail('owner'))).id
    intruderId = (await usersRepo.upsertByEmail(database.db, uniqueEmail('intruder'))).id
    // `scope: 'session'` — the header guard now requires it explicitly (plugins/auth-guard.ts).
    ownerToken = await app.jwt.sign({ sub: ownerId, email: 'owner@example.com', scope: 'session' })
    intruderToken = await app.jwt.sign({ sub: intruderId, email: 'intruder@example.com', scope: 'session' })
    albumId = (await albumsRepo.create(database.db, { ownerId, name: 'Trip' })).id
  })

  afterEach(async () => {
    await app.close()
    await rm(uploadDir, { recursive: true, force: true })
  })

  function authHeader(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` }
  }

  async function uploadImage(
    token: string,
    filename: string,
    contentType: string,
    data: Buffer,
  ): Promise<string> {
    const payload = await buildMultipartPayload({ albumId }, { field: 'file', filename, contentType, data })
    const response = await app.inject({
      method: 'POST',
      url: '/images',
      headers: { ...authHeader(token), 'content-type': payload.contentType },
      payload: payload.body,
    })
    const body = response.json() as Envelope<{ id: string }>
    if (!body.data) {
      throw new Error(`fixture upload failed: ${JSON.stringify(body)}`)
    }
    return body.data.id
  }

  async function process(token: string, body: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/images/process', headers: authHeader(token), payload: body })
  }

  it('resizes fit-inside: output never exceeds the requested box and preserves aspect ratio', async () => {
    const original = await makeColorPng(400, 200)
    const imageId = await uploadImage(ownerToken, 'wide.png', 'image/png', original)

    const response = await process(ownerToken, { imageId, width: 100, height: 100, filter: 'none', quality: 80 })

    expect(response.statusCode).toBe(200)
    const body = (response.json() as Envelope<ProcessedImageBody>).data
    expect(body).toBeDefined()

    const resultBuffer = await readFile(join(uploadDir, body?.storagePath ?? ''))
    const metadata = await sharp(resultBuffer).metadata()

    expect(metadata.width).toBeLessThanOrEqual(100)
    expect(metadata.height).toBeLessThanOrEqual(100)
    expect((metadata.width ?? 0) / (metadata.height ?? 1)).toBeCloseTo(2, 1)
  })

  it('preserves the source format (png stays png)', async () => {
    const original = await makeColorPng(40, 40)
    const imageId = await uploadImage(ownerToken, 'square.png', 'image/png', original)

    const response = await process(ownerToken, { imageId, width: 20, height: 20, filter: 'none', quality: 80 })

    const body = (response.json() as Envelope<ProcessedImageBody>).data
    expect(body?.storagePath).toMatch(/\.png$/)

    const resultBuffer = await readFile(join(uploadDir, body?.storagePath ?? ''))
    const metadata = await sharp(resultBuffer).metadata()
    expect(metadata.format).toBe('png')
  })

  it('the grayscale filter actually equalizes R/G/B on every sampled pixel', async () => {
    // Two-tone, not uniform: a uniform fixture's "correct grayscale" output
    // is itself uniform, which is indistinguishable from a bug that just
    // fills every pixel with the same constant value, and a no-op filter
    // that merely forwards the fixture's own non-gray color would slip
    // through equally unnoticed if the two halves collapsed into one
    // undifferentiated read. Two differently-lit regions close both gaps.
    const original = await makeTwoToneColorPng(16, 16)
    const imageId = await uploadImage(ownerToken, 'color.png', 'image/png', original)

    const response = await process(ownerToken, { imageId, width: 16, height: 16, filter: 'grayscale', quality: 80 })

    const body = (response.json() as Envelope<ProcessedImageBody>).data
    const resultBuffer = await readFile(join(uploadDir, body?.storagePath ?? ''))

    // Force sRGB before reading raw bytes so `info.channels` is a stable,
    // known quantity (3) regardless of whether the PNG encoder chose an
    // indexed/palette or true-grayscale colour type — `toBeGreaterThanOrEqual(1)`
    // was a tautology that passed for any channel count at all.
    const { data, info } = await sharp(resultBuffer)
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect(info.channels).toBe(3)

    // Sample every pixel — small fixture, cheap to check exhaustively.
    for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
      const offset = pixel * info.channels
      const r = data[offset]
      const g = data[offset + 1]
      const b = data[offset + 2]
      expect(r).toBe(g)
      expect(g).toBe(b)
    }

    // The two source halves had different luminance — a correct per-pixel
    // conversion must still show that difference in the grayscale output.
    // A constant-fill bug (every pixel forced to one gray value) would
    // equalize R/G/B too, but would fail this one.
    const topPixel = data[0]
    const bottomOffset = (info.height - 1) * info.width * info.channels
    const bottomPixel = data[bottomOffset]
    expect(topPixel).not.toBe(bottomPixel)
  })

  it('quality affects byte size for a jpeg fixture: q20 produces a smaller file than q95', async () => {
    const noiseJpeg = await makeNoiseJpeg(256, 256, 100)
    const imageId = await uploadImage(ownerToken, 'noise.jpg', 'image/jpeg', noiseJpeg)

    const low = await process(ownerToken, { imageId, width: 256, height: 256, filter: 'none', quality: 20 })
    const high = await process(ownerToken, { imageId, width: 256, height: 256, filter: 'none', quality: 95 })

    expect(low.statusCode).toBe(200)
    expect(high.statusCode).toBe(200)

    const lowBody = (low.json() as Envelope<ProcessedImageBody>).data
    const highBody = (high.json() as Envelope<ProcessedImageBody>).data

    const lowBuffer = await readFile(join(uploadDir, lowBody?.storagePath ?? ''))
    const highBuffer = await readFile(join(uploadDir, highBody?.storagePath ?? ''))

    expect(lowBuffer.byteLength).toBeLessThan(highBuffer.byteLength)
  })

  it("rejects processing another owner's image with 404 NOT_FOUND", async () => {
    const original = await makeColorPng()
    const imageId = await uploadImage(ownerToken, 'mine.png', 'image/png', original)

    const response = await process(intruderToken, { imageId, width: 20, height: 20, filter: 'none', quality: 80 })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.NOT_FOUND } })
  })

  it('rejects processing an unknown image id with 404 NOT_FOUND', async () => {
    const response = await process(ownerToken, {
      imageId: randomUUID(),
      width: 20,
      height: 20,
      filter: 'none',
      quality: 80,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.NOT_FOUND } })
  })

  it('rejects width above the 4096 max with 422 VALIDATION_ERROR naming the field', async () => {
    const original = await makeColorPng()
    const imageId = await uploadImage(ownerToken, 'mine.png', 'image/png', original)

    const response = await process(ownerToken, { imageId, width: 4097, height: 100, filter: 'none', quality: 80 })

    expect(response.statusCode).toBe(422)
    const body = response.json() as Envelope<never>
    expect(body.error?.code).toBe(ERROR_CODES.VALIDATION_ERROR)
    expect(body.error?.message).toMatch(/width/i)
  })

  it('rejects an unknown filter value with 422 VALIDATION_ERROR naming the field', async () => {
    const original = await makeColorPng()
    const imageId = await uploadImage(ownerToken, 'mine.png', 'image/png', original)

    const response = await process(ownerToken, { imageId, width: 100, height: 100, filter: 'sepia', quality: 80 })

    expect(response.statusCode).toBe(422)
    const body = response.json() as Envelope<never>
    expect(body.error?.code).toBe(ERROR_CODES.VALIDATION_ERROR)
    expect(body.error?.message).toMatch(/filter/i)
  })

  it('rejects every /images/process call without a token with 401 UNAUTHORIZED', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/images/process',
      payload: { imageId: randomUUID(), width: 100, height: 100, filter: 'none', quality: 80 },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.UNAUTHORIZED } })
  })

  it('is idempotent: an identical repeat request returns the same row, no reprocessing, no duplicate row', async () => {
    const original = await makeColorPng(64, 64)
    const imageId = await uploadImage(ownerToken, 'repeat.png', 'image/png', original)
    const params = { imageId, width: 32, height: 32, filter: 'blur', quality: 80 }

    const first = await process(ownerToken, params)
    const second = await process(ownerToken, params)

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)

    const firstBody = (first.json() as Envelope<ProcessedImageBody>).data
    const secondBody = (second.json() as Envelope<ProcessedImageBody>).data

    expect(secondBody?.id).toBe(firstBody?.id)
    expect(secondBody?.storagePath).toBe(firstBody?.storagePath)

    const count = await database.pool.query('select count(*)::text from processed_images where image_id = $1', [
      imageId,
    ])
    expect(count.rows[0]?.count).toBe('1')
  })

  it('two parallel identical requests still collapse into exactly one row (idempotency under a race)', async () => {
    const original = await makeColorPng(64, 64)
    const imageId = await uploadImage(ownerToken, 'race.png', 'image/png', original)
    const params = { imageId, width: 32, height: 32, filter: 'sharpen', quality: 80 }

    const [first, second] = await Promise.all([process(ownerToken, params), process(ownerToken, params)])

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)

    const count = await database.pool.query('select count(*)::text from processed_images where image_id = $1', [
      imageId,
    ])
    expect(count.rows[0]?.count).toBe('1')
  })

  it('documents /images/process at /docs/json', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' })
    const document = response.json() as { paths: Record<string, unknown> }

    expect(document.paths).toHaveProperty('/images/process')
  })
})
