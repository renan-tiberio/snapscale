import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import * as albumsRepo from '@/repositories/albums.js'
import * as usersRepo from '@/repositories/users.js'

import { countRows, createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

describe('albumsRepo', () => {
  let database: TestDatabase
  let ownerId: string
  let intruderId: string

  beforeAll(async () => {
    database = await createTestDatabase()
  })

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    await truncateAll(database)
    ownerId = (await usersRepo.upsertByEmail(database.db, 'ada@example.com')).id
    intruderId = (await usersRepo.upsertByEmail(database.db, 'mallory@example.com')).id
  })

  it('creates an album with a null description when none is given', async () => {
    const album = await albumsRepo.create(database.db, { ownerId, name: 'Trip' })

    expect(album).toMatchObject({ ownerId, name: 'Trip', description: null })
    expect(album.createdAt).toBeInstanceOf(Date)
    expect(album.updatedAt).toBeInstanceOf(Date)
  })

  it('rejects an album whose owner does not exist with foreign_key_violation 23503', async () => {
    await expect(
      albumsRepo.create(database.db, { ownerId: randomUUID(), name: 'Ghost' }),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('lists only the albums of the given owner', async () => {
    await albumsRepo.create(database.db, { ownerId, name: 'Mine' })
    await albumsRepo.create(database.db, { ownerId: intruderId, name: 'Theirs' })

    const mine = await albumsRepo.listByOwner(database.db, ownerId)

    expect(mine.map((album) => album.name)).toEqual(['Mine'])
  })

  it('findById is owner-scoped — another owner gets undefined', async () => {
    const album = await albumsRepo.create(database.db, { ownerId, name: 'Private' })

    expect(await albumsRepo.findById(database.db, album.id, ownerId)).toMatchObject({
      id: album.id,
    })
    expect(await albumsRepo.findById(database.db, album.id, intruderId)).toBeUndefined()
  })

  it('updates name and description for the owner', async () => {
    const album = await albumsRepo.create(database.db, {
      ownerId,
      name: 'Old',
      description: 'old text',
    })

    const updated = await albumsRepo.update(database.db, album.id, ownerId, {
      name: 'New',
      description: null,
    })

    expect(updated).toMatchObject({ id: album.id, name: 'New', description: null })
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(album.updatedAt.getTime())
  })

  it('refuses to update another owner album and leaves the row untouched', async () => {
    const album = await albumsRepo.create(database.db, { ownerId, name: 'Private' })

    const updated = await albumsRepo.update(database.db, album.id, intruderId, { name: 'Stolen' })

    expect(updated).toBeUndefined()
    expect(await albumsRepo.findById(database.db, album.id, ownerId)).toMatchObject({
      name: 'Private',
    })
  })

  it('deletes the album for its owner', async () => {
    const album = await albumsRepo.create(database.db, { ownerId, name: 'Doomed' })

    const removed = await albumsRepo.remove(database.db, album.id, ownerId)

    expect(removed).toMatchObject({ id: album.id })
    expect(await albumsRepo.findById(database.db, album.id, ownerId)).toBeUndefined()
    expect(await countRows(database, 'albums')).toBe(0)
  })

  it('refuses to delete another owner album', async () => {
    const album = await albumsRepo.create(database.db, { ownerId, name: 'Private' })

    const removed = await albumsRepo.remove(database.db, album.id, intruderId)

    expect(removed).toBeUndefined()
    expect(await countRows(database, 'albums')).toBe(1)
  })

  it('cascades to the owner deletion', async () => {
    await albumsRepo.create(database.db, { ownerId, name: 'Orphan-to-be' })

    await database.pool.query('delete from users where id = $1', [ownerId])

    expect(await countRows(database, 'albums')).toBe(0)
  })
})
