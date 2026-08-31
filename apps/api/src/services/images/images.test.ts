import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AlbumId, Email, ImageId, StorageKey, UserId } from '@snapscale/shared'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import * as albumsRepo from '@/repositories/albums/index.js'
import * as imagesRepo from '@/repositories/images/index.js'
import * as usersRepo from '@/repositories/users/index.js'
import {
  ImageRowIntegrityError,
  ImageServiceError,
  getImage,
  uploadImage,
} from '@/services/images/index.js'
import { countRows, createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'
import { makeColorPng } from '~/test/fixtures.js'

/**
 * `uploadImage` writes the blob before it inserts the row, because the storage path is derived
 * from the generated id. A failed insert therefore leaves bytes on disk with nothing pointing
 * at them. The insert is failed through the repository — the only step between the write and a
 * successful return — so exactly that window is isolated.
 */
vi.mock('@/repositories/images/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/repositories/images/index.js')>()
  return { ...actual, create: vi.fn(actual.create) }
})

describe('uploadImage — blob/row compensation', () => {
  let database: TestDatabase
  let uploadDir: string
  let ownerId: UserId
  let albumId: AlbumId
  let png: Buffer

  beforeAll(async () => {
    database = await createTestDatabase()
    png = await makeColorPng()
  }, 60_000)

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'snapscale-compensation-'))
    await truncateAll({ handle: database })
    ownerId = new UserId(
      (await usersRepo.upsertByEmail({ db: database.db, email: new Email('owner@example.com') }))
        .id,
    )
    albumId = new AlbumId((await albumsRepo.create({ db: database.db, ownerId, name: 'Trip' })).id)
  })

  afterEach(async () => {
    await rm(uploadDir, { recursive: true, force: true })
  })

  const upload = async (): Promise<unknown> =>
    uploadImage({
      db: database.db,
      uploadDir,
      ownerId,
      albumId,
      originalFilename: 'sunset.png',
      mimeType: 'image/png',
      buffer: png,
    })

  it('leaves the blob on disk when the row insert succeeds', async () => {
    await upload()

    expect(await readdir(join(uploadDir, 'originals', ownerId.value))).toHaveLength(1)
    expect(await countRows({ handle: database, table: 'images' })).toBe(1)
  })

  it('removes the written blob when the row insert fails, and still surfaces the error', async () => {
    vi.mocked(imagesRepo.create).mockRejectedValueOnce(new Error('simulated insert failure'))

    await expect(upload()).rejects.toThrow('simulated insert failure')

    expect(await readdir(join(uploadDir, 'originals', ownerId.value))).toEqual([])
    expect(await countRows({ handle: database, table: 'images' })).toBe(0)
  })
})

describe('image row integrity', () => {
  let database: TestDatabase
  let ownerId: UserId
  let imageId: ImageId

  beforeAll(async () => {
    database = await createTestDatabase()
  }, 60_000)

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    await truncateAll({ handle: database })
    ownerId = new UserId(
      (
        await usersRepo.upsertByEmail({
          db: database.db,
          email: new Email('integrity@example.com'),
        })
      ).id,
    )
    const albumId = new AlbumId(
      (await albumsRepo.create({ db: database.db, ownerId, name: 'Trip' })).id,
    )
    imageId = new ImageId(
      (
        await imagesRepo.create({
          db: database.db,
          albumId,
          ownerId,
          originalFilename: 'sunset.png',
          mimeType: 'image/png',
          sizeBytes: 128,
          storagePath: new StorageKey(`originals/${ownerId.value}/x.png`),
          width: 4,
          height: 4,
        })
      ).id,
    )
  })

  it('throws a typed integrity error — not a silent cast — for a mime_type outside the allowlist', async () => {
    // `images.mime_type` is a plain `text` column; only the upload route enforces the
    // allowlist, so nothing stops a row from carrying anything.
    await database.pool.query(`update images set mime_type = 'application/pdf' where id = $1`, [
      imageId.value,
    ])

    await expect(getImage({ db: database.db, imageId, ownerId })).rejects.toThrow(
      ImageRowIntegrityError,
    )
    await expect(getImage({ db: database.db, imageId, ownerId })).rejects.toThrow(
      /application\/pdf/,
    )
  })

  it('throws the same typed integrity error for a row missing its dimensions', async () => {
    await database.pool.query('update images set width = null where id = $1', [imageId.value])

    await expect(getImage({ db: database.db, imageId, ownerId })).rejects.toThrow(
      ImageRowIntegrityError,
    )
  })

  it('is not an ImageServiceError — a corrupt row must not be answered with a 404', async () => {
    await database.pool.query(`update images set mime_type = 'application/pdf' where id = $1`, [
      imageId.value,
    ])

    await expect(getImage({ db: database.db, imageId, ownerId })).rejects.not.toBeInstanceOf(
      ImageServiceError,
    )
  })
})
