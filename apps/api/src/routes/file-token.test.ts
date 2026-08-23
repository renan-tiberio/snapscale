import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'

import { ERROR_CODES } from '@snapscale/shared'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { App } from '@/app.js'

import { buildApp } from '@/app.js'
import * as albumsRepo from '@/repositories/albums.js'
import * as usersRepo from '@/repositories/users.js'
import { createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'
import { buildMultipartPayload, makeColorPng } from '~/test/fixtures.js'

const JWT_SECRET = 'test-file-token-secret'

interface Envelope<T> {
  readonly success: boolean
  readonly data?: T
  readonly error?: { readonly code: string; readonly message: string }
}

interface FileTokenBody {
  readonly token: string
}

interface ImageBody {
  readonly id: string
  readonly storagePath: string
}

function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@example.com`
}

/** Collects every chunk written to a Fastify/pino logger stream as plain text lines. */
function createCapturingLogStream(): { stream: Writable; lines: () => string[] } {
  const chunks: Buffer[] = []
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk)
      callback()
    },
  })

  return {
    stream,
    lines: () => Buffer.concat(chunks).toString('utf8').split('\n').filter((line) => line.length > 0),
  }
}

describe('GET /auth/file-token (docs/03 §4 — scoped file tokens)', () => {
  let database: TestDatabase
  let app: App
  let uploadDir: string
  let ownerId: string
  let sessionToken: string
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
    uploadDir = await mkdtemp(join(tmpdir(), 'snapscale-file-token-'))
    app = await buildApp({ logger: false, db: database.db, jwtSecret: JWT_SECRET, uploadDir })
    await app.ready()

    await truncateAll(database)
    ownerId = (await usersRepo.upsertByEmail(database.db, uniqueEmail('owner'))).id
    sessionToken = await app.jwt.sign({ sub: ownerId, email: 'owner@example.com', scope: 'session' })
    albumId = (await albumsRepo.create(database.db, { ownerId, name: 'Trip' })).id
  })

  afterEach(async () => {
    await app.close()
    await rm(uploadDir, { recursive: true, force: true })
  })

  async function uploadImage(): Promise<ImageBody> {
    const payload = await buildMultipartPayload(
      { albumId },
      { field: 'file', filename: 'sunset.png', contentType: 'image/png', data: pngBuffer },
    )
    const response = await app.inject({
      method: 'POST',
      url: '/images',
      headers: { authorization: `Bearer ${sessionToken}`, 'content-type': payload.contentType },
      payload: payload.body,
    })
    const body = (response.json() as Envelope<ImageBody>).data
    if (!body) {
      throw new Error(`fixture upload failed: ${JSON.stringify(response.json())}`)
    }
    return body
  }

  it('responds 401 UNAUTHORIZED without a session Authorization header', async () => {
    const response = await app.inject({ method: 'GET', url: '/auth/file-token' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.UNAUTHORIZED } })
  })

  it('responds 401 UNAUTHORIZED when given a file-scoped token instead of a session token', async () => {
    const fileToken = await app.jwt.sign({ sub: ownerId, scope: 'file' })

    const response = await app.inject({
      method: 'GET',
      url: '/auth/file-token',
      headers: { authorization: `Bearer ${fileToken}` },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ success: false, error: { code: ERROR_CODES.UNAUTHORIZED } })
  })

  it('responds 200 with a `scope: "file"`, 60s-lived token for a valid session', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/file-token',
      headers: { authorization: `Bearer ${sessionToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = (response.json() as Envelope<FileTokenBody>).data
    expect(body?.token).toBeTruthy()

    const payload = app.jwt.verify(body?.token ?? '') as { sub: string; scope: string; iat: number; exp: number }
    expect(payload.sub).toBe(ownerId)
    expect(payload.scope).toBe('file')
    expect(payload.exp - payload.iat).toBe(60)
  })

  it('the returned file token grants 200 on GET /files/* and GET /images/:id/file via ?token=', async () => {
    const image = await uploadImage()

    const issued = await app.inject({
      method: 'GET',
      url: '/auth/file-token',
      headers: { authorization: `Bearer ${sessionToken}` },
    })
    const fileToken = (issued.json() as Envelope<FileTokenBody>).data?.token ?? ''

    const viaFiles = await app.inject({
      method: 'GET',
      url: `/files/${image.storagePath}?token=${fileToken}`,
    })
    const viaImages = await app.inject({
      method: 'GET',
      url: `/images/${image.id}/file?token=${fileToken}`,
    })

    expect(viaFiles.statusCode).toBe(200)
    expect(viaImages.statusCode).toBe(200)
  })

  it('the returned file token is rejected with 401 when replayed as the session Authorization header', async () => {
    const issued = await app.inject({
      method: 'GET',
      url: '/auth/file-token',
      headers: { authorization: `Bearer ${sessionToken}` },
    })
    const fileToken = (issued.json() as Envelope<FileTokenBody>).data?.token ?? ''

    const response = await app.inject({
      method: 'GET',
      url: '/auth/file-token',
      headers: { authorization: `Bearer ${fileToken}` },
    })

    expect(response.statusCode).toBe(401)
  })

  it('never logs the raw token value from a `?token=` request line — it is redacted from `req.url`', async () => {
    const image = await uploadImage()
    const fileToken = await app.jwt.sign({ sub: ownerId, scope: 'file' })
    const capture = createCapturingLogStream()

    const loggedApp = await buildApp({
      logger: { stream: capture.stream },
      db: database.db,
      jwtSecret: JWT_SECRET,
      uploadDir,
    })
    await loggedApp.ready()

    const response = await loggedApp.inject({
      method: 'GET',
      url: `/files/${image.storagePath}?token=${fileToken}`,
    })
    expect(response.statusCode).toBe(200)
    await loggedApp.close()

    const lines = capture.lines()
    expect(lines.length).toBeGreaterThan(0)

    // No logged line anywhere contains the raw token value.
    for (const line of lines) {
      expect(line).not.toContain(fileToken)
    }

    // At least one line is the actual request log carrying the redacted URL,
    // so the assertion above isn't vacuously true because nothing logged the url.
    const requestLine = lines
      .map((line) => JSON.parse(line) as { req?: { url?: string } })
      .find((parsed) => typeof parsed.req?.url === 'string' && parsed.req.url.includes('token='))
    expect(requestLine).toBeDefined()
    expect(requestLine?.req?.url).toContain('[REDACTED]')
    expect(requestLine?.req?.url).not.toContain(fileToken)
  })

  it('documents the route at /docs/json', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' })
    const document = response.json() as { paths: Record<string, unknown> }

    expect(document.paths).toHaveProperty('/auth/file-token')
  })
})
