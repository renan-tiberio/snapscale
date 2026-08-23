import { createHash } from 'node:crypto'

import {
  ALLOWED_IMAGE_MIME_TYPES,
  ERROR_CODES,
  IMAGE_FILTERS,
  type AllowedImageMimeType,
  type ImageFilter,
  type ImageProcessOptions,
  type ProcessedImage as ApiProcessedImage,
} from '@snapscale/shared'
import sharp, { type Sharp } from 'sharp'

import type { Database } from '@/db/index.js'
import type { ProcessedImage as ProcessedImageRow } from '@/repositories/processed-images.js'

import * as imagesRepo from '@/repositories/images.js'
import * as processedImagesRepo from '@/repositories/processed-images.js'
import { ImageServiceError } from '@/services/images.js'
import { readUploadedFile, writeUploadedFile } from '@/services/storage.js'

const MIME_EXTENSIONS: Record<AllowedImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** libvips blur `sigma` for the `blur` filter — visibly soft, well inside sharp's [0.3, 1000] range. */
const BLUR_SIGMA = 5

/**
 * Thrown when a persisted row violates an invariant that's supposed to be
 * enforced elsewhere (upload validation for `images.mime_type`, request
 * validation for `processed_images.filter`) — i.e. the row itself is
 * corrupt, not something the caller did wrong. Deliberately NOT an
 * `ImageServiceError`: the route only maps that one to 404 (unknown/foreign
 * image), and this is neither — it has to fall through to a real 500.
 */
export class ImageDataInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageDataInvariantError'
  }
}

function isAllowedImageMimeType(value: string | undefined): value is AllowedImageMimeType {
  return value !== undefined && (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(value)
}

function isImageFilter(value: string | undefined): value is ImageFilter {
  return value !== undefined && (IMAGE_FILTERS as readonly string[]).includes(value)
}

/**
 * `processed_images.params_hash` (docs/03 §7): sha256 of the canonical
 * params JSON. Keys are written in a fixed alphabetical order regardless of
 * the input object's own key order, so the hash is a stable function of
 * `{width,height,filter,quality}` alone — exactly what the unique
 * `(image_id, params_hash)` index, the idempotency check below, and phase
 * 8's cache reuse all depend on.
 */
export function canonicalParamsJson(params: ImageProcessOptions): string {
  return JSON.stringify({
    filter: params.filter,
    height: params.height,
    quality: params.quality,
    width: params.width,
  })
}

export function computeParamsHash(params: ImageProcessOptions): string {
  return createHash('sha256').update(canonicalParamsJson(params)).digest('hex')
}

function applyFilter(pipeline: Sharp, filter: ImageFilter): Sharp {
  switch (filter) {
    case 'grayscale':
      return pipeline.grayscale()
    case 'blur':
      return pipeline.blur(BLUR_SIGMA)
    case 'sharpen':
      return pipeline.sharpen()
    case 'none':
      return pipeline
  }
}

/**
 * Re-encodes in the *source* format at `quality` — the route only ever
 * changes size/filter/quality, never the image's format (docs/03 §4).
 *
 * PNG mapping: sharp's PNG output is lossless by default and ignores
 * `quality` entirely unless `palette: true` switches it to indexed/palette
 * encoding, where `quality` drives the palette-based quantization. PNG has
 * no direct DCT-style quality knob, so palette mode is the mapping used
 * here — documented instead of silently ignoring the param.
 */
function encodeInSourceFormat(pipeline: Sharp, mimeType: AllowedImageMimeType, quality: number): Sharp {
  switch (mimeType) {
    case 'image/jpeg':
      return pipeline.jpeg({ quality })
    case 'image/webp':
      return pipeline.webp({ quality })
    case 'image/png':
      return pipeline.png({ quality, palette: true })
  }
}

function toApiProcessedImage(row: ProcessedImageRow): ApiProcessedImage {
  if (!isImageFilter(row.filter)) {
    // `processed_images.filter` is a plain `text` column (the route is what
    // validates it, per the repo's own comment) — a row written by anything
    // other than this route's validated insert could carry a value outside
    // `IMAGE_FILTERS`. Surfacing that as a wrong-but-typed `ImageFilter` via
    // an unchecked cast would silently corrupt the response instead of
    // failing loudly.
    throw new ImageDataInvariantError(`processed_images.filter has an unsupported value: ${row.filter}`)
  }

  return {
    id: row.id,
    imageId: row.imageId,
    params: {
      width: row.width,
      height: row.height,
      filter: row.filter,
      quality: row.quality,
    },
    storagePath: row.storagePath,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  }
}

export interface ProcessImageServiceDeps {
  readonly db: Database
  readonly uploadDir: string
}

export interface ProcessImageInput extends ImageProcessOptions {
  readonly imageId: string
  readonly ownerId: string
}

/**
 * `POST /images/process` business logic (docs/03 §4/§7) — deliberately
 * **synchronous**: the sharp work below runs inline in the request, on
 * purpose (docs/00's future culprit route; do not queue/defer this, that is
 * a later phase's fix, not this one's).
 *
 * Idempotency, not caching: a repeat request with the exact same params
 * (same `paramsHash`) returns the row already on disk instead of running
 * sharp again, enforced by the unique `(image_id, params_hash)` index — not
 * a TTL or invalidation policy. That distinction matters because the cache
 * phase (docs/03 §6, phase 8) is a different, later mechanism reusing the
 * same hash for a different purpose.
 */
export async function processImage(
  deps: ProcessImageServiceDeps,
  input: ProcessImageInput,
): Promise<ApiProcessedImage> {
  const image = await imagesRepo.findById(deps.db, input.imageId)
  if (!image || image.ownerId !== input.ownerId) {
    throw new ImageServiceError(ERROR_CODES.NOT_FOUND, 'Image not found')
  }

  const params: ImageProcessOptions = {
    width: input.width,
    height: input.height,
    filter: input.filter,
    quality: input.quality,
  }
  const paramsHash = computeParamsHash(params)

  const existing = await processedImagesRepo.findByImageAndParamsHash(deps.db, input.imageId, paramsHash)
  if (existing) {
    return toApiProcessedImage(existing)
  }

  if (!isAllowedImageMimeType(image.mimeType)) {
    // Upload validation (`imageUploadConstraintsSchema`) is supposed to make
    // this impossible — a row outside jpeg/png/webp means the invariant was
    // violated upstream (or the column was written to directly). Fail
    // loudly rather than let an unchecked cast hand libvips a mime type it
    // was never validated against.
    throw new ImageDataInvariantError(`images.mime_type has an unsupported value: ${image.mimeType}`)
  }
  const mimeType = image.mimeType
  const extension = MIME_EXTENSIONS[mimeType]
  const originalBuffer = await readUploadedFile(deps.uploadDir, image.storagePath)

  // Measured around the sharp work only (decode + resize + filter +
  // encode) — not around the db/fs bookkeeping either side of it, per
  // docs/03 §7's `duration_ms` definition.
  const start = performance.now()
  const resized = sharp(originalBuffer).resize(params.width, params.height, { fit: 'inside' })
  const filtered = applyFilter(resized, params.filter)
  const pipeline = encodeInSourceFormat(filtered, mimeType, params.quality)
  const { data } = await pipeline.toBuffer({ resolveWithObject: true })
  const durationMs = Math.round(performance.now() - start)

  const storagePath = `processed/${input.imageId}/${paramsHash}.${extension}`
  await writeUploadedFile(deps.uploadDir, storagePath, data)

  try {
    const row = await processedImagesRepo.create(deps.db, {
      imageId: input.imageId,
      paramsHash,
      width: params.width,
      height: params.height,
      filter: params.filter,
      quality: params.quality,
      storagePath,
      durationMs,
    })
    return toApiProcessedImage(row)
  } catch (error) {
    // Two parallel identical requests can both miss the lookup above and
    // both finish the sharp work; only one insert wins the unique
    // (image_id, params_hash) index. The loser has to refetch and return
    // the winner's row instead of surfacing a 500 — "repeat = idempotent"
    // has to hold under real concurrency too (docs/03 §7, the concurrency
    // smoke test), not just for sequential repeats.
    //
    // This used to gate that recovery on the error being a Postgres
    // unique_violation (SQLSTATE 23505). That check never actually matches
    // a real failure here: drizzle-orm 0.45 wraps every driver error in a
    // `DrizzleQueryError` and puts the pg error — and with it `.code` — on
    // `.cause`, not on the wrapper itself (confirmed against this exact
    // insert; see the sibling unique-violation assertions in
    // `repositories/albums.test.ts`, `images.test.ts` and
    // `processed-images.test.ts`, all of which assert on `cause.code`).
    // Under real load the loser can also fail with something that isn't a
    // unique violation at all — a saturated connection pool or a dropped
    // connection — *after* the winner's row is already durably committed,
    // which a code-equality check can never anticipate.
    //
    // The actual invariant this route promises is "does a matching row
    // exist now", not "was this specific error a unique violation" — so
    // always re-check for that row before giving up, whatever the error
    // was. Only rethrow the original error, unmodified, if the row still
    // isn't there: a genuine failure must still surface as a real 500,
    // never get swallowed into a false 200.
    let winner: ProcessedImageRow | undefined
    try {
      winner = await processedImagesRepo.findByImageAndParamsHash(deps.db, input.imageId, paramsHash)
    } catch {
      // The recovery read failed too (most likely the same outage that
      // broke the insert) — the original insert error is the more
      // informative one to surface.
      throw error
    }
    if (winner) {
      return toApiProcessedImage(winner)
    }
    throw error
  }
}
