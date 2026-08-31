import { AlbumId, ImageId, StorageKey, UserId } from '@snapscale/shared'
import { and, desc, eq } from 'drizzle-orm'

import type { Database } from '@/db/index.js'

import { firstRow, requireRow } from '@/db/rows/index.js'
import { images } from '@/db/schema.js'

export type Image = typeof images.$inferSelect

export type CreateImageInput = {
  /**
   * Optional: the upload service generates the id upfront so it can build
   * `storagePath` before the row exists. Omitted, the column's
   * `defaultRandom()` applies — the pre-existing repo tests rely on that.
   */
  readonly id?: ImageId
  readonly albumId: AlbumId
  readonly ownerId: UserId
  readonly originalFilename: string
  readonly mimeType: string
  readonly sizeBytes: number
  readonly storagePath: StorageKey
  /** Sharp-read dimensions; `undefined` for rows without them. */
  readonly width?: number
  readonly height?: number
}

type CreateParams = {
  readonly db: Database
} & CreateImageInput

export const create = async ({
  db,
  id,
  albumId,
  ownerId,
  originalFilename,
  mimeType,
  sizeBytes,
  storagePath,
  width,
  height,
}: CreateParams): Promise<Image> => {
  const inserted = await db
    .insert(images)
    .values({
      ...(id === undefined ? {} : { id: id.value }),
      albumId: albumId.value,
      ownerId: ownerId.value,
      originalFilename,
      mimeType,
      sizeBytes,
      storagePath: storagePath.value,
      width: width ?? null,
      height: height ?? null,
    })
    .returning()

  return requireRow({ rows: inserted, context: 'imagesRepo.create' })
}

type ListByAlbumParams = {
  readonly db: Database
  readonly albumId: AlbumId
}

export const listByAlbum = ({ db, albumId }: ListByAlbumParams): Promise<Image[]> =>
  db.select().from(images).where(eq(images.albumId, albumId.value)).orderBy(desc(images.createdAt))

type FindByIdParams = {
  readonly db: Database
  readonly id: ImageId
}

export const findById = async ({ db, id }: FindByIdParams): Promise<Image | undefined> =>
  firstRow({ rows: await db.select().from(images).where(eq(images.id, id.value)).limit(1) })

type FindByStoragePathForOwnerParams = {
  readonly db: Database
  readonly storagePath: StorageKey
  readonly ownerId: UserId
}

/**
 * `GET /files/*` ownership check for original files: ownership is part of
 * the predicate itself, same reason as `albumsRepo.findById` — a wrong owner
 * and a missing row are the same `undefined`, never an oracle.
 */
export const findByStoragePathForOwner = async ({
  db,
  storagePath,
  ownerId,
}: FindByStoragePathForOwnerParams): Promise<Image | undefined> =>
  firstRow({
    rows: await db
      .select()
      .from(images)
      .where(and(eq(images.storagePath, storagePath.value), eq(images.ownerId, ownerId.value)))
      .limit(1),
  })
