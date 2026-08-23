import { desc, eq } from 'drizzle-orm'

import type { Database } from '@/db/index.js'

import { firstRow, requireRow } from '@/db/rows.js'
import { images } from '@/db/schema.js'

export type Image = typeof images.$inferSelect

export interface CreateImageInput {
  readonly albumId: string
  readonly ownerId: string
  readonly originalFilename: string
  readonly mimeType: string
  readonly sizeBytes: number
  /** Relative to `UPLOAD_DIR`: `originals/{ownerId}/{imageId}.{ext}` — docs/03 §7. */
  readonly storagePath: string
}

export async function create(db: Database, input: CreateImageInput): Promise<Image> {
  const inserted = await db
    .insert(images)
    .values({ ...input })
    .returning()

  return requireRow(inserted, 'imagesRepo.create')
}

export async function listByAlbum(db: Database, albumId: string): Promise<Image[]> {
  return db.select().from(images).where(eq(images.albumId, albumId)).orderBy(desc(images.createdAt))
}

export async function findById(db: Database, id: string): Promise<Image | undefined> {
  return firstRow(await db.select().from(images).where(eq(images.id, id)).limit(1))
}
