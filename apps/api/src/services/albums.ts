
import type { Database } from '@/db/index.js'
import type { Album as AlbumRow } from '@/repositories/albums.js'
import type { Album as ApiAlbum } from '@snapscale/shared'

import * as albumsRepo from '@/repositories/albums.js'

/**
 * Maps the db row (`owner_id`) onto the api's `Album` contract
 * (`packages/shared`, which names the field `userId`) and serializes dates —
 * the one piece of "business logic" this route needs beyond owner scoping,
 * which the repository already enforces.
 */
function toApiAlbum(row: AlbumRow): ApiAlbum {
  return {
    id: row.id,
    userId: row.ownerId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listAlbums(db: Database, ownerId: string): Promise<ApiAlbum[]> {
  const rows = await albumsRepo.listByOwner(db, ownerId)
  return rows.map(toApiAlbum)
}

export interface CreateAlbumServiceInput {
  readonly name: string
  // `| undefined` mirrors the zod-inferred `createAlbumSchema` output exactly
  // (`exactOptionalPropertyTypes` treats `description?: string` and
  // `description?: string | undefined` as different types).
  readonly description?: string | undefined
}

export async function createAlbum(
  db: Database,
  ownerId: string,
  input: CreateAlbumServiceInput,
): Promise<ApiAlbum> {
  const row = await albumsRepo.create(db, {
    ownerId,
    name: input.name,
    description: input.description ?? null,
  })
  return toApiAlbum(row)
}

export async function getAlbum(db: Database, id: string, ownerId: string): Promise<ApiAlbum | undefined> {
  const row = await albumsRepo.findById(db, id, ownerId)
  return row ? toApiAlbum(row) : undefined
}

export interface UpdateAlbumServiceInput {
  readonly name?: string | undefined
  readonly description?: string | undefined
}

export async function updateAlbum(
  db: Database,
  id: string,
  ownerId: string,
  patch: UpdateAlbumServiceInput,
): Promise<ApiAlbum | undefined> {
  const row = await albumsRepo.update(db, id, ownerId, {
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.description === undefined ? {} : { description: patch.description }),
  })
  return row ? toApiAlbum(row) : undefined
}

/** Returns whether an album owned by `ownerId` was actually deleted. */
export async function removeAlbum(db: Database, id: string, ownerId: string): Promise<boolean> {
  const row = await albumsRepo.remove(db, id, ownerId)
  return row !== undefined
}
