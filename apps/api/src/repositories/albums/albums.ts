import { AlbumId, UserId } from '@snapscale/shared'
import { and, count, desc, eq } from 'drizzle-orm'

import type { Database } from '@/db/index.js'

import { firstRow, requireRow } from '@/db/rows/index.js'
import { albums } from '@/db/schema.js'

export type Album = typeof albums.$inferSelect

export type CreateAlbumInput = {
  readonly ownerId: UserId
  readonly name: string
  readonly description?: string | null
}

type CreateParams = {
  readonly db: Database
} & CreateAlbumInput

export const create = async ({ db, ownerId, name, description }: CreateParams): Promise<Album> => {
  const inserted = await db
    .insert(albums)
    .values({ ownerId: ownerId.value, name, description: description ?? null })
    .returning()

  return requireRow({ rows: inserted, context: 'albumsRepo.create' })
}

export type AlbumPageQuery = {
  readonly limit: number
  readonly offset: number
}

export type AlbumPage = {
  readonly rows: Album[]
  /** Albums this owner has in total — not the length of `rows`. */
  readonly total: number
}

type ListPageByOwnerParams = {
  readonly db: Database
  readonly ownerId: UserId
  readonly page: AlbumPageQuery
}

/**
 * One page of the owner's albums, newest first, plus the full count so the
 * response can carry `meta { total, page, limit }`. Two statements rather
 * than a `count(*) over ()` window column: the window value only rides on
 * rows that came back, so a page past the end would report a total of zero.
 */
export const listPageByOwner = async ({
  db,
  ownerId,
  page,
}: ListPageByOwnerParams): Promise<AlbumPage> => {
  const [rows, counted] = await Promise.all([
    db
      .select()
      .from(albums)
      .where(eq(albums.ownerId, ownerId.value))
      .orderBy(desc(albums.createdAt))
      .limit(page.limit)
      .offset(page.offset),
    db.select({ total: count() }).from(albums).where(eq(albums.ownerId, ownerId.value)),
  ])

  return { rows, total: counted[0]?.total ?? 0 }
}

type FindByIdParams = {
  readonly db: Database
  readonly id: AlbumId
  readonly ownerId: UserId
}

/**
 * Ownership is part of every predicate, never a check done afterwards in a
 * service: a wrong owner gets `undefined` (→ 404) and the row is never read,
 * updated, or deleted. Same reason the update/delete below take `ownerId`.
 */
export const findById = async ({ db, id, ownerId }: FindByIdParams): Promise<Album | undefined> =>
  firstRow({
    rows: await db
      .select()
      .from(albums)
      .where(and(eq(albums.id, id.value), eq(albums.ownerId, ownerId.value)))
      .limit(1),
  })

export type UpdateAlbumInput = {
  readonly name?: string
  readonly description?: string | null
}

type UpdateParams = {
  readonly db: Database
  readonly id: AlbumId
  readonly ownerId: UserId
  readonly patch: UpdateAlbumInput
}

export const update = async ({
  db,
  id,
  ownerId,
  patch,
}: UpdateParams): Promise<Album | undefined> => {
  const changes = {
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.description === undefined ? {} : { description: patch.description }),
    updatedAt: new Date(),
  }

  return firstRow({
    rows: await db
      .update(albums)
      .set(changes)
      .where(and(eq(albums.id, id.value), eq(albums.ownerId, ownerId.value)))
      .returning(),
  })
}

type RemoveParams = {
  readonly db: Database
  readonly id: AlbumId
  readonly ownerId: UserId
}

/** `delete` is a reserved word, hence `remove`. Returns the deleted row, or `undefined`. */
export const remove = async ({ db, id, ownerId }: RemoveParams): Promise<Album | undefined> =>
  firstRow({
    rows: await db
      .delete(albums)
      .where(and(eq(albums.id, id.value), eq(albums.ownerId, ownerId.value)))
      .returning(),
  })
