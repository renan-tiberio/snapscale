import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import * as albumsRepo from '@/repositories/albums.js'
import * as imagesRepo from '@/repositories/images.js'
import * as processedImagesRepo from '@/repositories/processed-images.js'
import * as usersRepo from '@/repositories/users.js'
import { countRows, createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

const PARAMS_HASH = 'a1b2c3d4'

describe('processedImagesRepo', () => {
  let database: TestDatabase
  let ownerId: string
  let albumId: string
  let imageId: string

  const processedInput = (overrides: { imageId?: string; paramsHash?: string } = {}) => ({
    imageId: overrides.imageId ?? imageId,
    paramsHash: overrides.paramsHash ?? PARAMS_HASH,
    width: 1920,
    height: 1080,
    filter: 'blur',
    quality: 80,
    storagePath: `processed/${overrides.imageId ?? imageId}/${overrides.paramsHash ?? PARAMS_HASH}.jpg`,
    durationMs: 412,
  })

  const createImage = async (filename: string): Promise<string> =>
    (
      await imagesRepo.create(database.db, {
        albumId,
        ownerId,
        originalFilename: filename,
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
        storagePath: `originals/${ownerId}/${filename}`,
      })
    ).id

  beforeAll(async () => {
    database = await createTestDatabase()
  })

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    await truncateAll(database)
    ownerId = (await usersRepo.upsertByEmail(database.db, 'ada@example.com')).id
    albumId = (await albumsRepo.create(database.db, { ownerId, name: 'Trip' })).id
    imageId = await createImage('sunset.jpg')
  })

  it('stores the processing result with its params and duration', async () => {
    const processed = await processedImagesRepo.create(database.db, processedInput())

    expect(processed).toMatchObject({
      imageId,
      paramsHash: PARAMS_HASH,
      width: 1920,
      height: 1080,
      filter: 'blur',
      quality: 80,
      durationMs: 412,
    })
    expect(processed.createdAt).toBeInstanceOf(Date)
  })

  it('finds a previous result by image and params hash — the phase-8 cache lookup', async () => {
    const created = await processedImagesRepo.create(database.db, processedInput())

    expect(
      await processedImagesRepo.findByImageAndParamsHash(database.db, imageId, PARAMS_HASH),
    ).toEqual(created)
    expect(
      await processedImagesRepo.findByImageAndParamsHash(database.db, imageId, 'other-hash'),
    ).toBeUndefined()
  })

  it('rejects the same params hash twice for one image with unique_violation 23505', async () => {
    await processedImagesRepo.create(database.db, processedInput())

    // drizzle wraps driver failures in DrizzleQueryError; the pg error — and
    // with it the SQLSTATE and constraint name — rides on `cause`.
    await expect(processedImagesRepo.create(database.db, processedInput())).rejects.toMatchObject({
      cause: {
        code: '23505',
        constraint: 'processed_images_image_id_params_hash_unique',
      },
    })
  })

  it('allows the same params hash for a different image', async () => {
    const otherImageId = await createImage('beach.jpg')
    await processedImagesRepo.create(database.db, processedInput())

    const other = await processedImagesRepo.create(
      database.db,
      processedInput({ imageId: otherImageId }),
    )

    expect(other.imageId).toBe(otherImageId)
    expect(await countRows(database, 'processed_images')).toBe(2)
  })

  it('is cascade-deleted with its image', async () => {
    await processedImagesRepo.create(database.db, processedInput())

    await database.pool.query('delete from images where id = $1', [imageId])

    expect(await countRows(database, 'processed_images')).toBe(0)
  })
})
