import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { App } from '@/app.js'

import { buildApp } from '@/app.js'
import * as albumsRepo from '@/repositories/albums.js'
import * as usersRepo from '@/repositories/users.js'
import { createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'
import { buildMultipartPayload, makeNoiseJpeg } from '~/test/fixtures.js'

const JWT_SECRET = 'test-images-process-concurrency-secret'
const PARALLEL_REQUESTS = 10

interface Envelope<T> {
  readonly success: boolean
  readonly data?: T
}

interface ProcessedImageBody {
  readonly storagePath: string
  readonly durationMs: number
}

function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@example.com`
}

function stats(values: readonly number[]): { min: number; avg: number; max: number } {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length
  return { min, avg, max }
}

/**
 * Concurrency smoke test (plan requirement, docs/00's future culprit route):
 * fires `PARALLEL_REQUESTS` real, distinct-params `/images/process` calls at
 * once on a real (high-entropy) fixture image, asserts every one succeeds
 * with a distinct output, and PRINTS baseline wall-clock + sharp-only
 * latency stats — the "this route is the bottleneck" evidence this phase
 * documents but does not yet fix (phase 2+ is the queue/observability fix).
 *
 * Deliberately no timing assertions: thresholds on wall-clock latency are
 * exactly the kind of flaky assert docs/03 §9 rule 4 bans. Strict on
 * correctness (every response 200, every storage path distinct), loose on
 * timing (printed, not asserted).
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

    await truncateAll(database)
    ownerId = (await usersRepo.upsertByEmail(database.db, uniqueEmail('owner'))).id
    // `scope: 'session'` — the header guard now requires it explicitly (plugins/auth-guard.ts).
    ownerToken = await app.jwt.sign({ sub: ownerId, email: 'owner@example.com', scope: 'session' })
    albumId = (await albumsRepo.create(database.db, { ownerId, name: 'Trip' })).id
  })

  afterEach(async () => {
    await app.close()
    await rm(uploadDir, { recursive: true, force: true })
  })

  it(
    `runs ${PARALLEL_REQUESTS} parallel process calls on one real fixture image — all succeed, latency baseline printed`,
    async () => {
      const fixture = await makeNoiseJpeg(640, 480, 100)
      const uploadPayload = await buildMultipartPayload(
        { albumId },
        { field: 'file', filename: 'fixture.jpg', contentType: 'image/jpeg', data: fixture },
      )
      const uploadResponse = await app.inject({
        method: 'POST',
        url: '/images',
        headers: { authorization: `Bearer ${ownerToken}`, 'content-type': uploadPayload.contentType },
        payload: uploadPayload.body,
      })
      const imageId = (uploadResponse.json() as Envelope<{ id: string }>).data?.id
      expect(imageId).toBeDefined()

      // Distinct width per call — 10 genuinely different paramsHash values,
      // so this measures real concurrent sharp work, not the idempotency
      // shortcut (that path has its own dedicated test).
      const requests = Array.from({ length: PARALLEL_REQUESTS }, (_, index) => ({
        imageId,
        width: 100 + index * 5,
        height: 100,
        filter: 'blur',
        quality: 80,
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

      const bodies = timedResponses.map(({ response }) => (response.json() as Envelope<ProcessedImageBody>).data)
      const storagePaths = bodies.map((body) => body?.storagePath)
      expect(new Set(storagePaths).size).toBe(PARALLEL_REQUESTS)

      const wallLatencies = timedResponses.map(({ wallMs }) => wallMs)
      const sharpLatencies = bodies.map((body) => body?.durationMs ?? 0)

      const wall = stats(wallLatencies)
      const sharpOnly = stats(sharpLatencies)

      // eslint-disable-next-line no-console -- deliberate: the concurrency baseline is a printed artifact, not an assertion (docs/00, docs/04 plan requirement).
      console.log(
        `[concurrency-smoke] ${PARALLEL_REQUESTS} parallel /images/process — ` +
          `wall(ms) min=${wall.min.toFixed(1)} avg=${wall.avg.toFixed(1)} max=${wall.max.toFixed(1)} total=${totalWallMs.toFixed(1)} | ` +
          `sharp-only(ms) min=${sharpOnly.min.toFixed(1)} avg=${sharpOnly.avg.toFixed(1)} max=${sharpOnly.max.toFixed(1)}`,
      )

      expect(wallLatencies.every((value) => Number.isFinite(value) && value >= 0)).toBe(true)
      expect(sharpLatencies.every((value) => Number.isFinite(value) && value >= 0)).toBe(true)
    },
    60_000,
  )
})
