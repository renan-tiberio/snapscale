import { and, eq } from 'drizzle-orm'

import type { Database } from '@/db/index.js'

import { firstRow, requireRow } from '@/db/rows.js'
import { processedImages } from '@/db/schema.js'

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
