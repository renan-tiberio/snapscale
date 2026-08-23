import { and, eq } from 'drizzle-orm'

import type { Database } from '@/db/index.js'

import { firstRow, requireRow } from '@/db/rows.js'
import { images, processedImages } from '@/db/schema.js'

export type ProcessedImage = typeof processedImages.$inferSelect

export interface CreateProcessedImageInput {
  readonly imageId: string
  /** sha256 of the canonical params JSON — docs/03 §7. */
  readonly paramsHash: string
  readonly width: number
  readonly height: number
  /** One of `packages/shared`'s `IMAGE_FILTERS`; the route validates, the column stores text. */
  readonly filter: string
  readonly quality: number
  readonly storagePath: string
  readonly durationMs: number
}

export async function create(
  db: Database,
  input: CreateProcessedImageInput,
): Promise<ProcessedImage> {
  const inserted = await db
    .insert(processedImages)
    .values({ ...input })
    .returning()

  return requireRow(inserted, 'processedImagesRepo.create')
}

/**
 * The phase-8 cache lookup: one indexed read on the unique
 * (image_id, params_hash) pair decides whether sharp runs at all.
 */
export async function findByImageAndParamsHash(
  db: Database,
  imageId: string,
  paramsHash: string,
): Promise<ProcessedImage | undefined> {
  return firstRow(
    await db
      .select()
      .from(processedImages)
      .where(and(eq(processedImages.imageId, imageId), eq(processedImages.paramsHash, paramsHash)))
      .limit(1),
  )
}

/**
 * `GET /files/*` ownership check (docs/03 §7) for processed output:
 * `processed_images` has no owner column, so ownership is proven by joining
 * back to the `images` row it was derived from — same "wrong owner and
 * missing row are the same `undefined`" rule as `imagesRepo`.
 */
export async function findByStoragePathForOwner(
  db: Database,
  storagePath: string,
  ownerId: string,
): Promise<ProcessedImage | undefined> {
  return firstRow(
    await db
      .select({
        id: processedImages.id,
        imageId: processedImages.imageId,
        paramsHash: processedImages.paramsHash,
        width: processedImages.width,
        height: processedImages.height,
        filter: processedImages.filter,
        quality: processedImages.quality,
        storagePath: processedImages.storagePath,
        durationMs: processedImages.durationMs,
        createdAt: processedImages.createdAt,
      })
      .from(processedImages)
      .innerJoin(images, eq(images.id, processedImages.imageId))
      .where(and(eq(processedImages.storagePath, storagePath), eq(images.ownerId, ownerId)))
      .limit(1),
  )
}
