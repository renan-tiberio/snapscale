import { AlbumId, Email, ImageId, StorageKey, UserId } from '@snapscale/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import * as albumsRepo from '@/repositories/albums/index.js'
import * as imagesRepo from '@/repositories/images/index.js'
import * as processedImagesRepo from '@/repositories/processed-images/index.js'
import * as usersRepo from '@/repositories/users/index.js'
import { countRows, createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

const PARAMS_HASH = 'a1b2c3d4'

describe('processedImagesRepo', () => {
  let database: TestDatabase
  let ownerId: UserId
  let albumId: AlbumId
  let imageId: ImageId

  const processedInput = (
    overrides: { imageId?: ImageId; paramsHash?: string } = {},
  ): processedImagesRepo.CreateProcessedImageInput => {
    const resolvedImageId = overrides.imageId ?? imageId
    const resolvedParamsHash = overrides.paramsHash ?? PARAMS_HASH

    return {
      imageId: resolvedImageId,
      paramsHash: resolvedParamsHash,
      width: 1920,
      height: 1080,
      filter: 'blur',
      quality: 80,
      storagePath: new StorageKey(`processed/${resolvedImageId.value}/${resolvedParamsHash}.jpg`),
      durationMs: 412,
    }
  }

  const createImage = async (filename: string): Promise<ImageId> =>
    new ImageId(
      (
        await imagesRepo.create({
          db: database.db,
          albumId,
          ownerId,
          originalFilename: filename,
          mimeType: 'image/jpeg',
          sizeBytes: 2048,
          storagePath: new StorageKey(`originals/${ownerId.value}/${filename}`),
        })
      ).id,
    )

  beforeAll(async () => {
    database = await createTestDatabase()
  })

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    await truncateAll({ handle: database })
    ownerId = new UserId(
      (await usersRepo.upsertByEmail({ db: database.db, email: new Email('ada@example.com') })).id,
    )
    albumId = new AlbumId((await albumsRepo.create({ db: database.db, ownerId, name: 'Trip' })).id)
    imageId = await createImage('sunset.jpg')
  })

  it('stores the processing result with its params and duration', async () => {
    const processed = await processedImagesRepo.create({ db: database.db, ...processedInput() })

    expect(processed).toMatchObject({
      imageId: imageId.value,
      paramsHash: PARAMS_HASH,
      width: 1920,
      height: 1080,
      filter: 'blur',
      quality: 80,
      durationMs: 412,
    })
    expect(processed.createdAt).toBeInstanceOf(Date)
  })

  it('finds a previous result by image and params hash', async () => {
    const created = await processedImagesRepo.create({ db: database.db, ...processedInput() })

    expect(
      await processedImagesRepo.findByImageAndParamsHash({
        db: database.db,
        imageId,
        paramsHash: PARAMS_HASH,
      }),
    ).toEqual(created)
    expect(
      await processedImagesRepo.findByImageAndParamsHash({
        db: database.db,
        imageId,
        paramsHash: 'other-hash',
      }),
    ).toBeUndefined()
  })

  it('rejects the same params hash twice for one image with unique_violation 23505', async () => {
    await processedImagesRepo.create({ db: database.db, ...processedInput() })

    // drizzle wraps driver failures in DrizzleQueryError; the pg error — and
    // with it the SQLSTATE and constraint name — rides on `cause`.
    await expect(
      processedImagesRepo.create({ db: database.db, ...processedInput() }),
    ).rejects.toMatchObject({
      cause: {
        code: '23505',
        constraint: 'processed_images_image_id_params_hash_unique',
      },
    })
  })

  it('allows the same params hash for a different image', async () => {
    const otherImageId = await createImage('beach.jpg')
    await processedImagesRepo.create({ db: database.db, ...processedInput() })

    const other = await processedImagesRepo.create({
      db: database.db,
      ...processedInput({ imageId: otherImageId }),
    })

    expect(other.imageId).toBe(otherImageId.value)
    expect(await countRows({ handle: database, table: 'processed_images' })).toBe(2)
  })

  it('is cascade-deleted with its image', async () => {
    await processedImagesRepo.create({ db: database.db, ...processedInput() })

    await database.pool.query('delete from images where id = $1', [imageId.value])

    expect(await countRows({ handle: database, table: 'processed_images' })).toBe(0)
  })
})
