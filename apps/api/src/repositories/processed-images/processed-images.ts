import { ImageId, StorageKey, UserId } from '@snapscale/shared'
import { and, eq } from 'drizzle-orm'

import type { Database } from '@/db/index.js'

import { firstRow, requireRow } from '@/db/rows/index.js'
import { images, processedImages } from '@/db/schema.js'

export type ProcessedImage = typeof processedImages.$inferSelect

export type CreateProcessedImageInput = {
  readonly imageId: ImageId
  /** sha256 of the canonical params JSON. */
  readonly paramsHash: string
  readonly width: number
  readonly height: number
  /** One of `packages/shared`'s `IMAGE_FILTERS`; the route validates, the column stores text. */
  readonly filter: string
  readonly quality: number
  readonly storagePath: StorageKey
  readonly durationMs: number
}

type CreateParams = {
  readonly db: Database
} & CreateProcessedImageInput

export const create = async ({
  db,
  imageId,
  paramsHash,
  width,
  height,
  filter,
  quality,
  storagePath,
  durationMs,
}: CreateParams): Promise<ProcessedImage> => {
  const inserted = await db
    .insert(processedImages)
    .values({
      imageId: imageId.value,
      paramsHash,
      width,
      height,
      filter,
      quality,
      storagePath: storagePath.value,
      durationMs,
    })
    .returning()

  return requireRow({ rows: inserted, context: 'processedImagesRepo.create' })
}

type FindByImageAndParamsHashParams = {
  readonly db: Database
  readonly imageId: ImageId
  readonly paramsHash: string
}

/** One indexed read on the unique (image_id, params_hash) pair decides whether sharp runs at all. */
export const findByImageAndParamsHash = async ({
  db,
  imageId,
  paramsHash,
}: FindByImageAndParamsHashParams): Promise<ProcessedImage | undefined> =>
  firstRow({
    rows: await db
      .select()
      .from(processedImages)
      .where(
        and(eq(processedImages.imageId, imageId.value), eq(processedImages.paramsHash, paramsHash)),
      )
      .limit(1),
  })

type FindByStoragePathForOwnerParams = {
  readonly db: Database
  readonly storagePath: StorageKey
  readonly ownerId: UserId
}

/**
 * `GET /files/*` ownership check for processed output: `processed_images` has
 * no owner column, so ownership is proven by joining back to the `images` row
 * it was derived from — same "wrong owner and missing row are the same
 * `undefined`" rule as `imagesRepo`.
 */
export const findByStoragePathForOwner = async ({
  db,
  storagePath,
  ownerId,
}: FindByStoragePathForOwnerParams): Promise<ProcessedImage | undefined> =>
  firstRow({
    rows: await db
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
      .where(
        and(eq(processedImages.storagePath, storagePath.value), eq(images.ownerId, ownerId.value)),
      )
      .limit(1),
  })
