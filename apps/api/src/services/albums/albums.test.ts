import { randomUUID } from 'node:crypto'

import { AlbumId, Email, UserId } from '@snapscale/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import * as albumsRepo from '@/repositories/albums/index.js'
import * as usersRepo from '@/repositories/users/index.js'
import {
  createAlbum,
  getAlbum,
  listAlbums,
  removeAlbum,
  updateAlbum,
} from '@/services/albums/index.js'
import { createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

const uniqueEmail = ({ label }: { label: string }): Email =>
  new Email(`${label}-${randomUUID()}@example.com`)

describe('albums service', () => {
  let database: TestDatabase
  let ownerId: UserId
  let intruderId: UserId

  beforeAll(async () => {
    database = await createTestDatabase()
  }, 60_000)

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    await truncateAll({ handle: database })
    ownerId = new UserId(
      (await usersRepo.upsertByEmail({ db: database.db, email: uniqueEmail({ label: 'owner' }) }))
        .id,
    )
    intruderId = new UserId(
      (
        await usersRepo.upsertByEmail({
          db: database.db,
          email: uniqueEmail({ label: 'intruder' }),
        })
      ).id,
    )
  })

  it('names the owner column `userId` on the wire and serializes timestamps as ISO strings', async () => {
    const created = await createAlbum({
      db: database.db,
      ownerId,
      name: 'Trip',
      description: 'Summer',
    })

    expect(created.userId).toBe(ownerId.value)
    expect(created.name).toBe('Trip')
    expect(created.description).toBe('Summer')
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt)
    expect(new Date(created.updatedAt).toISOString()).toBe(created.updatedAt)
  })

  it('stores a missing description as null rather than dropping the column', async () => {
    const created = await createAlbum({ db: database.db, ownerId, name: 'Trip' })

    expect(created.description).toBeNull()
  })

  it('reports the owner total in meta, not the length of the page it returned', async () => {
    for (const name of ['a', 'b', 'c']) {
      await albumsRepo.create({ db: database.db, ownerId, name })
    }
    await albumsRepo.create({ db: database.db, ownerId: intruderId, name: 'theirs' })

    const page = await listAlbums({ db: database.db, ownerId, pagination: { page: 1, limit: 2 } })

    expect(page.albums).toHaveLength(2)
    expect(page.meta).toEqual({ total: 3, page: 1, limit: 2 })
  })

  it('offsets by page number, so page 2 of limit 2 returns the remaining album', async () => {
    for (const name of ['a', 'b', 'c']) {
      await albumsRepo.create({ db: database.db, ownerId, name })
    }

    const page = await listAlbums({ db: database.db, ownerId, pagination: { page: 2, limit: 2 } })

    expect(page.albums).toHaveLength(1)
    expect(page.meta.total).toBe(3)
  })

  it('never lists an album belonging to another owner', async () => {
    await albumsRepo.create({ db: database.db, ownerId: intruderId, name: 'theirs' })

    const page = await listAlbums({ db: database.db, ownerId, pagination: { page: 1, limit: 10 } })

    expect(page.albums).toEqual([])
    expect(page.meta.total).toBe(0)
  })

  it('returns undefined for an existing album owned by someone else', async () => {
    const theirs = await albumsRepo.create({ db: database.db, ownerId: intruderId, name: 'theirs' })

    const found = await getAlbum({ db: database.db, id: new AlbumId(theirs.id), ownerId })

    expect(found).toBeUndefined()
  })

  it('applies only the fields present in the patch and leaves the rest untouched', async () => {
    const created = await createAlbum({
      db: database.db,
      ownerId,
      name: 'Trip',
      description: 'Summer',
    })

    const updated = await updateAlbum({
      db: database.db,
      id: new AlbumId(created.id),
      ownerId,
      patch: { name: 'Trip 2024' },
    })

    expect(updated?.name).toBe('Trip 2024')
    expect(updated?.description).toBe('Summer')
  })

  it('returns undefined when the update targets an album owned by someone else', async () => {
    const theirs = await albumsRepo.create({ db: database.db, ownerId: intruderId, name: 'theirs' })

    const updated = await updateAlbum({
      db: database.db,
      id: new AlbumId(theirs.id),
      ownerId,
      patch: { name: 'mine now' },
    })

    expect(updated).toBeUndefined()
    const survivor = await albumsRepo.findById({
      db: database.db,
      id: new AlbumId(theirs.id),
      ownerId: intruderId,
    })
    expect(survivor?.name).toBe('theirs')
  })

  it('reports true only when a row was actually deleted', async () => {
    const created = await createAlbum({ db: database.db, ownerId, name: 'Trip' })

    expect(await removeAlbum({ db: database.db, id: new AlbumId(created.id), ownerId })).toBe(true)
    expect(await removeAlbum({ db: database.db, id: new AlbumId(created.id), ownerId })).toBe(false)
  })

  it('refuses to delete an album owned by someone else and leaves the row in place', async () => {
    const theirs = await albumsRepo.create({ db: database.db, ownerId: intruderId, name: 'theirs' })

    const removed = await removeAlbum({ db: database.db, id: new AlbumId(theirs.id), ownerId })

    expect(removed).toBe(false)
    expect(
      await albumsRepo.findById({
        db: database.db,
        id: new AlbumId(theirs.id),
        ownerId: intruderId,
      }),
    ).toBeDefined()
  })
})
