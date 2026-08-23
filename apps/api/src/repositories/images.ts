import { desc, eq } from 'drizzle-orm'

import type { Database } from '@/db/index.js'

import { firstRow, requireRow } from '@/db/rows.js'
import { images } from '@/db/schema.js'

export type Image = typeof images.$inferSelect

export interface CreateImageInput {
  /**
   * Optional: the upload service (`services/images.ts`) generates the id
   * upfront so it can build `storagePath` (`originals/{ownerId}/{imageId}.{ext}`,
   * docs/03 §7) before the row exists. Omitted, the column's `defaultRandom()`
   * applies — the pre-existing repo tests rely on that.
   */
  readonly id?: string
  readonly albumId: string
  readonly ownerId: string
  readonly originalFilename: string
  readonly mimeType: string
  readonly sizeBytes: number
  /** Relative to `UPLOAD_DIR`: `originals/{ownerId}/{imageId}.{ext}` — docs/03 §7. */
  readonly storagePath: string
  /** Sharp-read dimensions (docs/03 §7); `undefined` for rows without them. */
  readonly width?: number
  readonly height?: number
}

export async function create(db: Database, input: CreateImageInput): Promise<Image> {
  const inserted = await db
    .insert(images)
    .values({
      ...(input.id === undefined ? {} : { id: input.id }),
      albumId: input.albumId,
      ownerId: input.ownerId,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storagePath: input.storagePath,
      width: input.width ?? null,
      height: input.height ?? null,
    })
    .returning()

  return requireRow(inserted, 'imagesRepo.create')
}

export async function listByAlbum(db: Database, albumId: string): Promise<Image[]> {
  return db.select().from(images).where(eq(images.albumId, albumId)).orderBy(desc(images.createdAt))
}

export async function findById(db: Database, id: string): Promise<Image | undefined> {
  return firstRow(await db.select().from(images).where(eq(images.id, id)).limit(1))
}
