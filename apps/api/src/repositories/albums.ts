import { and, desc, eq } from 'drizzle-orm'

import type { Database } from '@/db/index.js'

import { firstRow, requireRow } from '@/db/rows.js'
import { albums } from '@/db/schema.js'

export type Album = typeof albums.$inferSelect

export interface CreateAlbumInput {
  readonly ownerId: string
  readonly name: string
  readonly description?: string | null
}

export interface UpdateAlbumInput {
  readonly name?: string
  readonly description?: string | null
}

export async function create(db: Database, input: CreateAlbumInput): Promise<Album> {
  const inserted = await db
    .insert(albums)
    .values({
      ownerId: input.ownerId,
      name: input.name,
      description: input.description ?? null,
    })
    .returning()

  return requireRow(inserted, 'albumsRepo.create')
}

export async function listByOwner(db: Database, ownerId: string): Promise<Album[]> {
  return db.select().from(albums).where(eq(albums.ownerId, ownerId)).orderBy(desc(albums.createdAt))
}

/**
 * Ownership is part of every predicate, never a check done afterwards in a
 * service: a wrong owner gets `undefined` (→ 404) and the row is never read,
 * updated, or deleted. Same reason the update/delete below take `ownerId`.
 */
export async function findById(
  db: Database,
  id: string,
  ownerId: string,
): Promise<Album | undefined> {
  return firstRow(
    await db
      .select()
      .from(albums)
      .where(and(eq(albums.id, id), eq(albums.ownerId, ownerId)))
      .limit(1),
  )
}

export async function update(
  db: Database,
  id: string,
  ownerId: string,
  patch: UpdateAlbumInput,
): Promise<Album | undefined> {
  const changes = {
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.description === undefined ? {} : { description: patch.description }),
    updatedAt: new Date(),
  }

  return firstRow(
    await db
      .update(albums)
      .set(changes)
      .where(and(eq(albums.id, id), eq(albums.ownerId, ownerId)))
      .returning(),
  )
}

/** `delete` is a reserved word, hence `remove`. Returns the deleted row, or `undefined`. */
export async function remove(
  db: Database,
  id: string,
  ownerId: string,
): Promise<Album | undefined> {
  return firstRow(
    await db
      .delete(albums)
      .where(and(eq(albums.id, id), eq(albums.ownerId, ownerId)))
      .returning(),
  )
}
