import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import * as albumsRepo from '@/repositories/albums.js'
import * as imagesRepo from '@/repositories/images.js'
import * as usersRepo from '@/repositories/users.js'

import { countRows, createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

describe('imagesRepo', () => {
  let database: TestDatabase
  let ownerId: string
  let albumId: string

  const imageInput = (overrides: { albumId?: string; originalFilename?: string } = {}) => ({
    albumId: overrides.albumId ?? albumId,
    ownerId,
    originalFilename: overrides.originalFilename ?? 'sunset.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 2048,
    storagePath: `originals/${ownerId}/sunset.jpg`,
  })

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
  })

  it('creates an image row with its metadata', async () => {
    const image = await imagesRepo.create(database.db, imageInput())

    expect(image).toMatchObject({
      albumId,
      ownerId,
      originalFilename: 'sunset.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
    })
    expect(image.createdAt).toBeInstanceOf(Date)
  })

  it('rejects an image pointing at a missing album with foreign_key_violation 23503', async () => {
    await expect(
      imagesRepo.create(database.db, imageInput({ albumId: randomUUID() })),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('lists only the images of the requested album', async () => {
    const otherAlbumId = (await albumsRepo.create(database.db, { ownerId, name: 'Other' })).id
    await imagesRepo.create(database.db, imageInput({ originalFilename: 'a.jpg' }))
    await imagesRepo.create(database.db, imageInput({ originalFilename: 'b.jpg' }))
    await imagesRepo.create(
      database.db,
      imageInput({ albumId: otherAlbumId, originalFilename: 'c.jpg' }),
    )

    const listed = await imagesRepo.listByAlbum(database.db, albumId)

    expect(listed.map((image) => image.originalFilename).sort()).toEqual(['a.jpg', 'b.jpg'])
  })

  it('finds an image by id and returns undefined for an unknown id', async () => {
    const created = await imagesRepo.create(database.db, imageInput())

    expect(await imagesRepo.findById(database.db, created.id)).toEqual(created)
    expect(await imagesRepo.findById(database.db, randomUUID())).toBeUndefined()
  })

  it('is cascade-deleted with its album', async () => {
    await imagesRepo.create(database.db, imageInput())

    await albumsRepo.remove(database.db, albumId, ownerId)

    expect(await imagesRepo.listByAlbum(database.db, albumId)).toEqual([])
    expect(await countRows(database, 'images')).toBe(0)
  })
})
