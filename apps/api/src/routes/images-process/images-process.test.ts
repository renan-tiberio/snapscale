import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Email, ERROR_CODES, UserId } from '@snapscale/shared'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { App } from '@/app/index.js'

import { buildApp } from '@/app/index.js'
import * as albumsRepo from '@/repositories/albums/index.js'
import * as usersRepo from '@/repositories/users/index.js'
import { createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'
import {
  buildMultipartPayload,
  makeColorPng,
  makeNoiseJpeg,
  makeTwoToneColorPng,
} from '~/test/fixtures.js'

const JWT_SECRET = 'test-images-process-secret'

type Envelope<T> = {
  readonly success: boolean
  readonly data?: T
  readonly error?: { readonly code: string; readonly message: string }
}

type ProcessedImageBody = {
  readonly id: string
  readonly imageId: string
  readonly storagePath: string
  readonly durationMs: number
  readonly params: {
    readonly width: number
    readonly height: number
    readonly filter: string
    readonly quality: number
  }
}

const uniqueEmail = ({ label }: { label: string }): Email =>
  new Email(`${label}-${randomUUID()}@example.com`)

const PARALLEL_REQUESTS = 10
const FIXTURE_WIDTH = 640
const FIXTURE_HEIGHT = 480
const FIXTURE_QUALITY = 100
const BASE_PROCESS_WIDTH = 100
const PROCESS_WIDTH_STEP = 5
const PROCESS_HEIGHT = 100
const PROCESS_QUALITY = 80

const stats = ({
  values,
}: {
  values: readonly number[]
}): { min: number; avg: number; max: number } => ({
  min: Math.min(...values),
  max: Math.max(...values),
  avg: values.reduce((sum, value) => sum + value, 0) / values.length,
})

describe('POST /images/process (the heavy route)', () => {
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

    await truncateAll({ handle: database })
    ownerId = (
      await usersRepo.upsertByEmail({ db: database.db, email: uniqueEmail({ label: 'owner' }) })
    ).id
    intruderId = (
      await usersRepo.upsertByEmail({ db: database.db, email: uniqueEmail({ label: 'intruder' }) })
    ).id
    // `scope: 'session'` is explicit because the header guard requires it explicitly.
    ownerToken = await app.jwt.sign({ sub: ownerId, email: 'owner@example.com', scope: 'session' })
    intruderToken = await app.jwt.sign({
      sub: intruderId,
      email: 'intruder@example.com',
      scope: 'session',
    })
    albumId = (
      await albumsRepo.create({ db: database.db, ownerId: new UserId(ownerId), name: 'Trip' })
    ).id
  })

  afterEach(async () => {
    await app.close()
    await rm(uploadDir, { recursive: true, force: true })
  })

  const authHeader = ({ token }: { token: string }): Record<string, string> => ({
    authorization: `Bearer ${token}`,
  })

  const uploadImage = async ({
    token,
    filename,
    contentType,
    data,
  }: {
    token: string
    filename: string
    contentType: string
    data: Buffer
  }): Promise<string> => {
    const payload = await buildMultipartPayload({
      fields: { albumId },
      file: { field: 'file', filename, contentType, data },
    })
    const response = await app.inject({
      method: 'POST',
      url: '/images',
      headers: { ...authHeader({ token }), 'content-type': payload.contentType },
      payload: payload.body,
    })
    const body = response.json() as Envelope<{ id: string }>
    if (!body.data) {
      throw new Error(`fixture upload failed: ${JSON.stringify(body)}`)
    }
    return body.data.id
  }

  const requestProcess = async ({
    token,
    body,
  }: {
    token: string
    body: Record<string, unknown>
  }) =>
    app.inject({
      method: 'POST',
      url: '/images/process',
      headers: authHeader({ token }),
      payload: body,
    })

  it('resizes fit-inside: output never exceeds the requested box and preserves aspect ratio', async () => {
    const original = await makeColorPng({ width: 400, height: 200 })
    const imageId = await uploadImage({
      token: ownerToken,
      filename: 'wide.png',
      contentType: 'image/png',
      data: original,
    })

    const response = await requestProcess({
      token: ownerToken,
      body: { imageId, width: 100, height: 100, filter: 'none', quality: 80 },
    })

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
    const original = await makeColorPng({ width: 40, height: 40 })
    const imageId = await uploadImage({
      token: ownerToken,
      filename: 'square.png',
      contentType: 'image/png',
      data: original,
    })

    const response = await requestProcess({
      token: ownerToken,
      body: { imageId, width: 20, height: 20, filter: 'none', quality: 80 },
    })

    const body = (response.json() as Envelope<ProcessedImageBody>).data
    expect(body?.storagePath).toMatch(/\.png$/)

    const resultBuffer = await readFile(join(uploadDir, body?.storagePath ?? ''))
    const metadata = await sharp(resultBuffer).metadata()
    expect(metadata.format).toBe('png')
  })

  it('the grayscale filter actually equalizes R/G/B on every sampled pixel', async () => {
    // Two-tone, not uniform: a uniform fixture's correct grayscale output is itself uniform,
    // which a constant-fill bug would also produce.
    const original = await makeTwoToneColorPng({ width: 16, height: 16 })
    const imageId = await uploadImage({
      token: ownerToken,
      filename: 'color.png',
      contentType: 'image/png',
      data: original,
    })

    const response = await requestProcess({
      token: ownerToken,
      body: { imageId, width: 16, height: 16, filter: 'grayscale', quality: 80 },
    })

    const body = (response.json() as Envelope<ProcessedImageBody>).data
    const resultBuffer = await readFile(join(uploadDir, body?.storagePath ?? ''))

    // Force sRGB before reading raw bytes so `info.channels` is a known 3 whatever colour
    // type the PNG encoder picked.
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

    // The source halves had different luminance, so a correct per-pixel conversion still
    // shows that difference — a constant-fill bug equalizes R/G/B but fails here.
    const topPixel = data[0]
    const bottomOffset = (info.height - 1) * info.width * info.channels
    const bottomPixel = data[bottomOffset]
    expect(topPixel).not.toBe(bottomPixel)
  })

  it('quality affects byte size for a jpeg fixture: q20 produces a smaller file than q95', async () => {
    const noiseJpeg = await makeNoiseJpeg({ width: 256, height: 256, quality: 100 })
    const imageId = await uploadImage({
      token: ownerToken,
      filename: 'noise.jpg',
      contentType: 'image/jpeg',
      data: noiseJpeg,
    })

    const low = await requestProcess({
      token: ownerToken,
      body: { imageId, width: 256, height: 256, filter: 'none', quality: 20 },
    })
    const high = await requestProcess({
      token: ownerToken,
      body: { imageId, width: 256, height: 256, filter: 'none', quality: 95 },
    })

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
    const imageId = await uploadImage({
      token: ownerToken,
      filename: 'mine.png',
      contentType: 'image/png',
      data: original,
    })

    const response = await requestProcess({
      token: intruderToken,
      body: { imageId, width: 20, height: 20, filter: 'none', quality: 80 },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND },
    })
  })

  it('rejects processing an unknown image id with 404 NOT_FOUND', async () => {
    const response = await requestProcess({
      token: ownerToken,
      body: {
        imageId: randomUUID(),
        width: 20,
        height: 20,
        filter: 'none',
        quality: 80,
      },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND },
    })
  })

  it('rejects width above the 4096 max with 422 VALIDATION_ERROR naming the field', async () => {
    const original = await makeColorPng()
    const imageId = await uploadImage({
      token: ownerToken,
      filename: 'mine.png',
      contentType: 'image/png',
      data: original,
    })

    const response = await requestProcess({
      token: ownerToken,
      body: { imageId, width: 4097, height: 100, filter: 'none', quality: 80 },
    })

    expect(response.statusCode).toBe(422)
    const body = response.json() as Envelope<never>
    expect(body.error?.code).toBe(ERROR_CODES.VALIDATION_ERROR)
    expect(body.error?.message).toMatch(/width/i)
  })

  it('rejects an unknown filter value with 422 VALIDATION_ERROR naming the field', async () => {
    const original = await makeColorPng()
    const imageId = await uploadImage({
      token: ownerToken,
      filename: 'mine.png',
      contentType: 'image/png',
      data: original,
    })

    const response = await requestProcess({
      token: ownerToken,
      body: { imageId, width: 100, height: 100, filter: 'sepia', quality: 80 },
    })

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
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.UNAUTHORIZED },
    })
  })

  it('is idempotent: an identical repeat request returns the same row, no reprocessing, no duplicate row', async () => {
    const original = await makeColorPng({ width: 64, height: 64 })
    const imageId = await uploadImage({
      token: ownerToken,
      filename: 'repeat.png',
      contentType: 'image/png',
      data: original,
    })
    const params = { imageId, width: 32, height: 32, filter: 'blur', quality: 80 }

    const first = await requestProcess({ token: ownerToken, body: params })
    const second = await requestProcess({ token: ownerToken, body: params })

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)

    const firstBody = (first.json() as Envelope<ProcessedImageBody>).data
    const secondBody = (second.json() as Envelope<ProcessedImageBody>).data

    expect(secondBody?.id).toBe(firstBody?.id)
    expect(secondBody?.storagePath).toBe(firstBody?.storagePath)

    const count = await database.pool.query(
      'select count(*)::text from processed_images where image_id = $1',
      [imageId],
    )
    expect(count.rows[0]?.count).toBe('1')
  })

  it('two parallel identical requests still collapse into exactly one row (idempotency under a race)', async () => {
    const original = await makeColorPng({ width: 64, height: 64 })
    const imageId = await uploadImage({
      token: ownerToken,
      filename: 'race.png',
      contentType: 'image/png',
      data: original,
    })
    const params = { imageId, width: 32, height: 32, filter: 'sharpen', quality: 80 }

    const [first, second] = await Promise.all([
      requestProcess({ token: ownerToken, body: params }),
      requestProcess({ token: ownerToken, body: params }),
    ])

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)

    const count = await database.pool.query(
      'select count(*)::text from processed_images where image_id = $1',
      [imageId],
    )
    expect(count.rows[0]?.count).toBe('1')
  })

  it('documents /images/process at /docs/json', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' })
    const document = response.json() as { paths: Record<string, unknown> }

    expect(document.paths).toHaveProperty('/images/process')
  })
})

/**
 * Timing is printed, never asserted: a threshold on wall-clock latency is exactly the flaky
 * assert the test rules ban. Strict on correctness, loose on timing.
 */
describe('POST /images/process — concurrency smoke', () => {
  let database: TestDatabase
  let app: App
  let uploadDir: string
  let ownerId: string
  let ownerToken: string
  let albumId: string

  beforeAll(async () => {
    database = await createTestDatabase()
  }, 60_000)

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'snapscale-process-smoke-'))
    app = await buildApp({ logger: false, db: database.db, jwtSecret: JWT_SECRET, uploadDir })
    await app.ready()

    await truncateAll({ handle: database })
    ownerId = (
      await usersRepo.upsertByEmail({ db: database.db, email: uniqueEmail({ label: 'owner' }) })
    ).id
    // `scope: 'session'` is explicit because the header guard requires it explicitly.
    ownerToken = await app.jwt.sign({ sub: ownerId, email: 'owner@example.com', scope: 'session' })
    albumId = (
      await albumsRepo.create({ db: database.db, ownerId: new UserId(ownerId), name: 'Trip' })
    ).id
  })

  afterEach(async () => {
    await app.close()
    await rm(uploadDir, { recursive: true, force: true })
  })

  it(`runs ${PARALLEL_REQUESTS} parallel process calls on one real fixture image — all succeed, latency baseline printed`, async () => {
    const fixture = await makeNoiseJpeg({
      width: FIXTURE_WIDTH,
      height: FIXTURE_HEIGHT,
      quality: FIXTURE_QUALITY,
    })
    const uploadPayload = await buildMultipartPayload({
      fields: { albumId },
      file: { field: 'file', filename: 'fixture.jpg', contentType: 'image/jpeg', data: fixture },
    })
    const uploadResponse = await app.inject({
      method: 'POST',
      url: '/images',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': uploadPayload.contentType },
      payload: uploadPayload.body,
    })
    const imageId = (uploadResponse.json() as Envelope<{ id: string }>).data?.id
    expect(imageId).toBeDefined()

    // Distinct width per call, so every request has a different paramsHash: this measures
    // real concurrent sharp work, not the idempotency shortcut.
    const requests = Array.from({ length: PARALLEL_REQUESTS }, (_, index) => ({
      imageId,
      width: BASE_PROCESS_WIDTH + index * PROCESS_WIDTH_STEP,
      height: PROCESS_HEIGHT,
      filter: 'blur',
      quality: PROCESS_QUALITY,
    }))

    const wallStart = performance.now()
    const timedResponses = await Promise.all(
      requests.map(async (payload) => {
        const start = performance.now()
        const response = await app.inject({
          method: 'POST',
          url: '/images/process',
          headers: { authorization: `Bearer ${ownerToken}` },
          payload,
        })
        const wallMs = performance.now() - start
        return { response, wallMs }
      }),
    )
    const totalWallMs = performance.now() - wallStart

    for (const { response } of timedResponses) {
      expect(response.statusCode).toBe(200)
    }

    const bodies = timedResponses.map(
      ({ response }) => (response.json() as Envelope<ProcessedImageBody>).data,
    )
    const storagePaths = bodies.map((body) => body?.storagePath)
    expect(new Set(storagePaths).size).toBe(PARALLEL_REQUESTS)

    const wallLatencies = timedResponses.map(({ wallMs }) => wallMs)
    const sharpLatencies = bodies.map((body) => body?.durationMs ?? 0)

    const wall = stats({ values: wallLatencies })
    const sharpOnly = stats({ values: sharpLatencies })

    // eslint-disable-next-line no-console -- the concurrency baseline is a printed artifact, not an assertion.
    console.log(
      `[concurrency-smoke] ${PARALLEL_REQUESTS} parallel /images/process — ` +
        `wall(ms) min=${wall.min.toFixed(1)} avg=${wall.avg.toFixed(1)} max=${wall.max.toFixed(1)} total=${totalWallMs.toFixed(1)} | ` +
        `sharp-only(ms) min=${sharpOnly.min.toFixed(1)} avg=${sharpOnly.avg.toFixed(1)} max=${sharpOnly.max.toFixed(1)}`,
    )

    expect(wallLatencies.every((value) => Number.isFinite(value) && value >= 0)).toBe(true)
    expect(sharpLatencies.every((value) => Number.isFinite(value) && value >= 0)).toBe(true)
  }, 60_000)
})
