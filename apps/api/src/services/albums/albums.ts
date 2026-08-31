import type { Database } from '@/db/index.js'
import type { Album as AlbumRow } from '@/repositories/albums/index.js'
import type { AlbumId, Album as ApiAlbum, UserId } from '@snapscale/shared'

import * as albumsRepo from '@/repositories/albums/index.js'

/** The one wording for a missing (or foreign) album — the routes and the images service both send it. */
export const ALBUM_NOT_FOUND_MESSAGE = 'Album not found'

type ToApiAlbumParams = {
  readonly row: AlbumRow
}

/** The db column is `owner_id`; the shared `Album` contract names the same field `userId`. */
const toApiAlbum = ({ row }: ToApiAlbumParams): ApiAlbum => ({
  id: row.id,
  userId: row.ownerId,
  name: row.name,
  description: row.description,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export type AlbumPagination = {
  readonly page: number
  readonly limit: number
}

export type AlbumListPage = {
  readonly albums: ApiAlbum[]
  readonly meta: { readonly total: number; readonly page: number; readonly limit: number }
}

type ListAlbumsParams = {
  readonly db: Database
  readonly ownerId: UserId
  readonly pagination: AlbumPagination
}

export const listAlbums = async ({
  db,
  ownerId,
  pagination,
}: ListAlbumsParams): Promise<AlbumListPage> => {
  const page = await albumsRepo.listPageByOwner({
    db,
    ownerId,
    page: { limit: pagination.limit, offset: (pagination.page - 1) * pagination.limit },
  })

  return {
    albums: page.rows.map((row) => toApiAlbum({ row })),
    meta: { total: page.total, page: pagination.page, limit: pagination.limit },
  }
}

export type CreateAlbumServiceInput = {
  readonly name: string
  /**
   * `| undefined` mirrors the zod-inferred `createAlbumSchema` output exactly:
   * `exactOptionalPropertyTypes` treats `description?: string` as a different type.
   */
  readonly description?: string | undefined
}

type CreateAlbumParams = CreateAlbumServiceInput & {
  readonly db: Database
  readonly ownerId: UserId
}

export const createAlbum = async ({
  db,
  ownerId,
  name,
  description,
}: CreateAlbumParams): Promise<ApiAlbum> => {
  const row = await albumsRepo.create({ db, ownerId, name, description: description ?? null })
  return toApiAlbum({ row })
}

type OwnedAlbumParams = {
  readonly db: Database
  readonly id: AlbumId
  readonly ownerId: UserId
}

export const getAlbum = async ({
  db,
  id,
  ownerId,
}: OwnedAlbumParams): Promise<ApiAlbum | undefined> => {
  const row = await albumsRepo.findById({ db, id, ownerId })
  return row ? toApiAlbum({ row }) : undefined
}

export type UpdateAlbumServiceInput = {
  readonly name?: string | undefined
  readonly description?: string | undefined
}

type UpdateAlbumParams = OwnedAlbumParams & {
  readonly patch: UpdateAlbumServiceInput
}

export const updateAlbum = async ({
  db,
  id,
  ownerId,
  patch,
}: UpdateAlbumParams): Promise<ApiAlbum | undefined> => {
  const row = await albumsRepo.update({
    db,
    id,
    ownerId,
    patch: {
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.description === undefined ? {} : { description: patch.description }),
    },
  })
  return row ? toApiAlbum({ row }) : undefined
}

/** Whether an album owned by `ownerId` was actually deleted. */
export const removeAlbum = async ({ db, id, ownerId }: OwnedAlbumParams): Promise<boolean> => {
  const row = await albumsRepo.remove({ db, id, ownerId })
  return row !== undefined
}
