import { randomUUID } from 'node:crypto'

import { AlbumId, Email, UserId } from '@snapscale/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import * as albumsRepo from '@/repositories/albums/index.js'
import * as usersRepo from '@/repositories/users/index.js'
import { countRows, createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

describe('albumsRepo', () => {
  let database: TestDatabase
  let ownerId: UserId
  let intruderId: UserId

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
    intruderId = new UserId(
      (await usersRepo.upsertByEmail({ db: database.db, email: new Email('mallory@example.com') }))
        .id,
    )
  })

  it('creates an album with a null description when none is given', async () => {
    const album = await albumsRepo.create({ db: database.db, ownerId, name: 'Trip' })

    expect(album).toMatchObject({ ownerId: ownerId.value, name: 'Trip', description: null })
    expect(album.createdAt).toBeInstanceOf(Date)
    expect(album.updatedAt).toBeInstanceOf(Date)
  })

  it('rejects an album whose owner does not exist with foreign_key_violation 23503', async () => {
    // drizzle wraps driver failures in DrizzleQueryError; the pg error — and
    // with it the SQLSTATE and constraint name — rides on `cause`.
    await expect(
      albumsRepo.create({ db: database.db, ownerId: new UserId(randomUUID()), name: 'Ghost' }),
    ).rejects.toMatchObject({
      cause: { code: '23503', constraint: 'albums_owner_id_users_id_fk' },
    })
  })

  it('lists only the albums of the given owner', async () => {
    await albumsRepo.create({ db: database.db, ownerId, name: 'Mine' })
    await albumsRepo.create({ db: database.db, ownerId: intruderId, name: 'Theirs' })

    const mine = await albumsRepo.listPageByOwner({
      db: database.db,
      ownerId,
      page: { limit: 10, offset: 0 },
    })

    expect(mine.rows.map((album) => album.name)).toEqual(['Mine'])
    expect(mine.total).toBe(1)
  })

  it('counts every album of the owner, not just the ones on the requested page', async () => {
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      await albumsRepo.create({ db: database.db, ownerId, name })
    }
    await albumsRepo.create({ db: database.db, ownerId: intruderId, name: 'theirs' })

    const page = await albumsRepo.listPageByOwner({
      db: database.db,
      ownerId,
      page: { limit: 2, offset: 2 },
    })

    expect(page.rows).toHaveLength(2)
    // The intruder's album must not inflate the count either.
    expect(page.total).toBe(5)
  })

  it('returns an empty page with the real total when the offset is past the end', async () => {
    await albumsRepo.create({ db: database.db, ownerId, name: 'only' })

    const page = await albumsRepo.listPageByOwner({
      db: database.db,
      ownerId,
      page: { limit: 10, offset: 50 },
    })

    expect(page.rows).toEqual([])
    expect(page.total).toBe(1)
  })

  it('keeps the newest-first order stable across pages — no album seen twice or skipped', async () => {
    const names = ['first', 'second', 'third', 'fourth']
    for (const name of names) {
      // Distinct `created_at` values: the ordering key is a timestamp, and
      // four inserts inside the same millisecond would make the page split
      // arbitrary rather than deterministic.
      await albumsRepo.create({ db: database.db, ownerId, name })
      await new Promise((resolve) => setTimeout(resolve, 2))
    }

    const firstPage = await albumsRepo.listPageByOwner({
      db: database.db,
      ownerId,
      page: { limit: 2, offset: 0 },
    })
    const secondPage = await albumsRepo.listPageByOwner({
      db: database.db,
      ownerId,
      page: { limit: 2, offset: 2 },
    })

    expect(firstPage.rows.map((album) => album.name)).toEqual(['fourth', 'third'])
    expect(secondPage.rows.map((album) => album.name)).toEqual(['second', 'first'])
  })

  it('findById is owner-scoped — another owner gets undefined', async () => {
    const album = await albumsRepo.create({ db: database.db, ownerId, name: 'Private' })
    const albumId = new AlbumId(album.id)

    expect(await albumsRepo.findById({ db: database.db, id: albumId, ownerId })).toMatchObject({
      id: album.id,
    })
    expect(
      await albumsRepo.findById({ db: database.db, id: albumId, ownerId: intruderId }),
    ).toBeUndefined()
  })

  it('updates name and description for the owner', async () => {
    const album = await albumsRepo.create({
      db: database.db,
      ownerId,
      name: 'Old',
      description: 'old text',
    })

    const updated = await albumsRepo.update({
      db: database.db,
      id: new AlbumId(album.id),
      ownerId,
      patch: { name: 'New', description: null },
    })

    expect(updated).toMatchObject({ id: album.id, name: 'New', description: null })
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(album.updatedAt.getTime())
  })

  it('refuses to update another owner album and leaves the row untouched', async () => {
    const album = await albumsRepo.create({ db: database.db, ownerId, name: 'Private' })
    const albumId = new AlbumId(album.id)

    const updated = await albumsRepo.update({
      db: database.db,
      id: albumId,
      ownerId: intruderId,
      patch: { name: 'Stolen' },
    })

    expect(updated).toBeUndefined()
    expect(await albumsRepo.findById({ db: database.db, id: albumId, ownerId })).toMatchObject({
      name: 'Private',
    })
  })

  it('deletes the album for its owner', async () => {
    const album = await albumsRepo.create({ db: database.db, ownerId, name: 'Doomed' })
    const albumId = new AlbumId(album.id)

    const removed = await albumsRepo.remove({ db: database.db, id: albumId, ownerId })

    expect(removed).toMatchObject({ id: album.id })
    expect(await albumsRepo.findById({ db: database.db, id: albumId, ownerId })).toBeUndefined()
    expect(await countRows({ handle: database, table: 'albums' })).toBe(0)
  })

  it('refuses to delete another owner album', async () => {
    const album = await albumsRepo.create({ db: database.db, ownerId, name: 'Private' })

    const removed = await albumsRepo.remove({
      db: database.db,
      id: new AlbumId(album.id),
      ownerId: intruderId,
    })

    expect(removed).toBeUndefined()
    expect(await countRows({ handle: database, table: 'albums' })).toBe(1)
  })

  it('cascades to the owner deletion', async () => {
    await albumsRepo.create({ db: database.db, ownerId, name: 'Orphan-to-be' })

    await database.pool.query('delete from users where id = $1', [ownerId.value])

    expect(await countRows({ handle: database, table: 'albums' })).toBe(0)
  })
})
