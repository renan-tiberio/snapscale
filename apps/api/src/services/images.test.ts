import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import * as albumsRepo from '@/repositories/albums.js'
import * as imagesRepo from '@/repositories/images.js'
import * as usersRepo from '@/repositories/users.js'
import { createTestDatabase, countRows, truncateAll, type TestDatabase } from '~/test/db.js'
import { makeColorPng } from '~/test/fixtures.js'

/**
 * `uploadImage` writes the blob before it inserts the row (it needs the
 * generated id in the storage path). If the insert then fails, the bytes are
 * already on disk with nothing pointing at them — an orphan that nothing
 * will ever clean up and that still counts against the volume. This pins the
 * compensating unlink.
 *
 * The insert is forced to fail through the repository module rather than by
 * corrupting the schema: this is the *only* step between the write and a
 * successful return, so failing it isolates exactly the window under test.
 */

const failure = { create: false }

vi.mock('@/repositories/images.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/repositories/images.js')>()
  return {
    ...actual,
    create: async (...args: Parameters<typeof actual.create>) => {
      if (failure.create) {
        throw new Error('simulated insert failure')
      }
      return actual.create(...args)
    },
  }
})

const { ImageRowIntegrityError, ImageServiceError, getImage, uploadImage } = await import(
  '@/services/images.js'
)

describe('uploadImage — blob/row compensation', () => {
  let database: TestDatabase
  let uploadDir: string
  let ownerId: string
  let albumId: string
  let png: Buffer

  beforeAll(async () => {
    database = await createTestDatabase()
    png = await makeColorPng()
  }, 60_000)

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    failure.create = false
    uploadDir = await mkdtemp(join(tmpdir(), 'snapscale-compensation-'))
    await truncateAll(database)
    ownerId = (await usersRepo.upsertByEmail(database.db, 'owner@example.com')).id
    albumId = (await albumsRepo.create(database.db, { ownerId, name: 'Trip' })).id
  })

  afterEach(async () => {
    failure.create = false
    await rm(uploadDir, { recursive: true, force: true })
  })

  async function upload(): Promise<unknown> {
    return uploadImage(
      { db: database.db, uploadDir },
      { ownerId, albumId, originalFilename: 'sunset.png', mimeType: 'image/png', buffer: png },
    )
  }

  it('leaves the blob on disk when the row insert succeeds', async () => {
    await upload()

    expect(await readdir(join(uploadDir, 'originals', ownerId))).toHaveLength(1)
    expect(await countRows(database, 'images')).toBe(1)
  })

  it('removes the written blob when the row insert fails, and still surfaces the error', async () => {
    failure.create = true

    await expect(upload()).rejects.toThrow('simulated insert failure')

    expect(await readdir(join(uploadDir, 'originals', ownerId))).toEqual([])
    expect(await countRows(database, 'images')).toBe(0)
  })
})

describe('image row integrity', () => {
  let database: TestDatabase
  let uploadDir: string
  let ownerId: string
  let albumId: string
  let imageId: string

  beforeAll(async () => {
    database = await createTestDatabase()
  }, 60_000)

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    failure.create = false
    uploadDir = await mkdtemp(join(tmpdir(), 'snapscale-integrity-'))
    await truncateAll(database)
    ownerId = (await usersRepo.upsertByEmail(database.db, 'integrity@example.com')).id
    albumId = (await albumsRepo.create(database.db, { ownerId, name: 'Trip' })).id
    imageId = (
      await imagesRepo.create(database.db, {
        albumId,
        ownerId,
        originalFilename: 'sunset.png',
        mimeType: 'image/png',
        sizeBytes: 128,
        storagePath: `originals/${ownerId}/x.png`,
        width: 4,
        height: 4,
      })
    ).id
  })

  afterEach(async () => {
    await rm(uploadDir, { recursive: true, force: true })
  })

  it('throws a typed integrity error — not a silent cast — for a mime_type outside the allowlist', async () => {
    // `images.mime_type` is a plain `text` column; only the upload route
    // enforces the allowlist, so nothing stops a row from carrying anything.
    await database.pool.query(`update images set mime_type = 'application/pdf' where id = $1`, [imageId])

    await expect(getImage({ db: database.db, uploadDir }, imageId, ownerId)).rejects.toThrow(
      ImageRowIntegrityError,
    )
    await expect(getImage({ db: database.db, uploadDir }, imageId, ownerId)).rejects.toThrow(
      /application\/pdf/,
    )
  })

  it('throws the same typed integrity error for a row missing its dimensions', async () => {
    await database.pool.query('update images set width = null where id = $1', [imageId])

    await expect(getImage({ db: database.db, uploadDir }, imageId, ownerId)).rejects.toThrow(
      ImageRowIntegrityError,
    )
  })

  it('is not an ImageServiceError — a corrupt row must not be answered with a 404', async () => {
    await database.pool.query(`update images set mime_type = 'application/pdf' where id = $1`, [imageId])

    await expect(getImage({ db: database.db, uploadDir }, imageId, ownerId)).rejects.not.toBeInstanceOf(
      ImageServiceError,
    )
  })
})
