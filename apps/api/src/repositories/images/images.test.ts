import { randomUUID } from 'node:crypto'

import { AlbumId, Email, ImageId, StorageKey, UserId } from '@snapscale/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import * as albumsRepo from '@/repositories/albums/index.js'
import * as imagesRepo from '@/repositories/images/index.js'
import * as usersRepo from '@/repositories/users/index.js'
import { countRows, createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

describe('imagesRepo', () => {
  let database: TestDatabase
  let ownerId: UserId
  let albumId: AlbumId

  const imageInput = (
    overrides: { albumId?: AlbumId; originalFilename?: string } = {},
  ): Omit<imagesRepo.CreateImageInput, 'id'> => ({
    albumId: overrides.albumId ?? albumId,
    ownerId,
    originalFilename: overrides.originalFilename ?? 'sunset.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 2048,
    storagePath: new StorageKey(`originals/${ownerId.value}/sunset.jpg`),
  })

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
  })

  it('creates an image row with its metadata', async () => {
    const image = await imagesRepo.create({ db: database.db, ...imageInput() })

    expect(image).toMatchObject({
      albumId: albumId.value,
      ownerId: ownerId.value,
      originalFilename: 'sunset.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
    })
    expect(image.createdAt).toBeInstanceOf(Date)
  })

  it('rejects an image pointing at a missing album with foreign_key_violation 23503', async () => {
    // drizzle wraps driver failures in DrizzleQueryError; the pg error — and
    // with it the SQLSTATE and constraint name — rides on `cause`.
    await expect(
      imagesRepo.create({
        db: database.db,
        ...imageInput({ albumId: new AlbumId(randomUUID()) }),
      }),
    ).rejects.toMatchObject({
      cause: { code: '23503', constraint: 'images_album_id_albums_id_fk' },
    })
  })

  it('lists only the images of the requested album', async () => {
    const otherAlbumId = new AlbumId(
      (await albumsRepo.create({ db: database.db, ownerId, name: 'Other' })).id,
    )
    await imagesRepo.create({ db: database.db, ...imageInput({ originalFilename: 'a.jpg' }) })
    await imagesRepo.create({ db: database.db, ...imageInput({ originalFilename: 'b.jpg' }) })
    await imagesRepo.create({
      db: database.db,
      ...imageInput({ albumId: otherAlbumId, originalFilename: 'c.jpg' }),
    })

    const listed = await imagesRepo.listByAlbum({ db: database.db, albumId })
    const filenames = listed.map((image) => image.originalFilename)

    expect(filenames).toHaveLength(2)
    expect(filenames).toEqual(expect.arrayContaining(['a.jpg', 'b.jpg']))
  })

  it('finds an image by id and returns undefined for an unknown id', async () => {
    const created = await imagesRepo.create({ db: database.db, ...imageInput() })

    expect(await imagesRepo.findById({ db: database.db, id: new ImageId(created.id) })).toEqual(
      created,
    )
    expect(
      await imagesRepo.findById({ db: database.db, id: new ImageId(randomUUID()) }),
    ).toBeUndefined()
  })

  it('is cascade-deleted with its album', async () => {
    await imagesRepo.create({ db: database.db, ...imageInput() })

    await albumsRepo.remove({ db: database.db, id: albumId, ownerId })

    expect(await imagesRepo.listByAlbum({ db: database.db, albumId })).toEqual([])
    expect(await countRows({ handle: database, table: 'images' })).toBe(0)
  })
})
