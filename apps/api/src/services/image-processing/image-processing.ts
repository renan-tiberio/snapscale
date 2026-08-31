import {
  ERROR_CODES,
  StorageKey,
  imageProcessOptionsSchema,
  type AllowedImageMimeType,
  type ImageFilter,
  type ImageId,
  type ImageProcessOptions,
  type ProcessedImage as ApiProcessedImage,
  type UserId,
} from '@snapscale/shared'
import sharp, { type Sharp } from 'sharp'

import type { Database } from '@/db/index.js'
import type { ProcessedImage as ProcessedImageRow } from '@/repositories/processed-images/index.js'

import * as imagesRepo from '@/repositories/images/index.js'
import * as processedImagesRepo from '@/repositories/processed-images/index.js'
import { hashHex } from '@/services/hashing/index.js'
import {
  IMAGE_NOT_FOUND_MESSAGE,
  ImageServiceError,
  MIME_EXTENSIONS,
  toAllowedImageMimeType,
} from '@/services/images/index.js'
import { PROCESSED_PREFIX, readUploadedFile, writeUploadedFile } from '@/services/storage/index.js'

/** libvips blur `sigma` — visibly soft, well inside sharp's [0.3, 1000] range. */
const BLUR_SIGMA = 5

export type ImageDataInvariantErrorParams = {
  readonly message: string
}

/**
 * A persisted row broke an invariant enforced elsewhere (upload validation for
 * `images.mime_type`, request validation for `processed_images.filter`). Deliberately not an
 * `ImageServiceError`: the route maps that one to 404, and this has to fall through to a 500.
 */
export class ImageDataInvariantError extends Error {
  constructor({ message }: ImageDataInvariantErrorParams) {
    super(message)
    this.name = 'ImageDataInvariantError'
  }
}

type ToImageFilterParams = {
  readonly value: string
}

/** `undefined` for anything outside `IMAGE_FILTERS`; the shared schema does the narrowing. */
const toImageFilter = ({ value }: ToImageFilterParams): ImageFilter | undefined => {
  const parsed = imageProcessOptionsSchema.shape.filter.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

/**
 * `processed_images.params_hash`: sha256 of the canonical params JSON. The keys are written in
 * a fixed order regardless of the input object's own key order, so the hash is a stable
 * function of `{width,height,filter,quality}` alone — which the unique
 * `(image_id, params_hash)` index and the idempotency check below both depend on.
 */
export const canonicalParamsJson = ({
  filter,
  height,
  quality,
  width,
}: ImageProcessOptions): string => JSON.stringify({ filter, height, quality, width })

export const computeParamsHash = (params: ImageProcessOptions): string =>
  hashHex({ value: canonicalParamsJson(params) })

type FilterHandlerParams = {
  readonly pipeline: Sharp
}

type FilterHandler = (params: FilterHandlerParams) => Sharp

const FILTER_HANDLERS = {
  none: ({ pipeline }) => pipeline,
  grayscale: ({ pipeline }) => pipeline.grayscale(),
  blur: ({ pipeline }) => pipeline.blur(BLUR_SIGMA),
  sharpen: ({ pipeline }) => pipeline.sharpen(),
} as const satisfies Record<ImageFilter, FilterHandler>

type ApplyFilterParams = FilterHandlerParams & {
  readonly filter: ImageFilter
}

const applyFilter = ({ pipeline, filter }: ApplyFilterParams): Sharp =>
  FILTER_HANDLERS[filter]({ pipeline })

type EncoderParams = FilterHandlerParams & {
  readonly quality: number
}

type Encoder = (params: EncoderParams) => Sharp

const ENCODERS = {
  'image/jpeg': ({ pipeline, quality }) => pipeline.jpeg({ quality }),
  'image/webp': ({ pipeline, quality }) => pipeline.webp({ quality }),
  // PNG output is lossless and ignores `quality` unless `palette: true` switches it to indexed
  // encoding, where `quality` drives the quantization — PNG has no DCT-style quality knob.
  'image/png': ({ pipeline, quality }) => pipeline.png({ quality, palette: true }),
} as const satisfies Record<AllowedImageMimeType, Encoder>

type EncodeInSourceFormatParams = EncoderParams & {
  readonly mimeType: AllowedImageMimeType
}

/** The route only ever changes size/filter/quality, never the image's format. */
const encodeInSourceFormat = ({ pipeline, mimeType, quality }: EncodeInSourceFormatParams): Sharp =>
  ENCODERS[mimeType]({ pipeline, quality })

type ToApiProcessedImageParams = {
  readonly row: ProcessedImageRow
}

const toApiProcessedImage = ({ row }: ToApiProcessedImageParams): ApiProcessedImage => {
  const filter = toImageFilter({ value: row.filter })

  if (!filter) {
    // `processed_images.filter` is a plain `text` column validated only by the route; casting
    // an out-of-range value to `ImageFilter` would corrupt the response instead of failing.
    throw new ImageDataInvariantError({
      message: `processed_images.filter has an unsupported value: ${row.filter}`,
    })
  }

  return {
    id: row.id,
    imageId: row.imageId,
    params: {
      width: row.width,
      height: row.height,
      filter,
      quality: row.quality,
    },
    storagePath: row.storagePath,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  }
}

type ProcessImageServiceParams = ImageProcessOptions & {
  readonly db: Database
  readonly uploadDir: string
  readonly imageId: ImageId
  readonly ownerId: UserId
}

/**
 * `POST /images/process`. The sharp work runs inline in the request on purpose — queueing it is
 * a later phase's change, not a cleanup.
 *
 * Idempotency, not caching: a repeat with the same `paramsHash` returns the row already on
 * disk, enforced by the unique `(image_id, params_hash)` index rather than by a TTL.
 */
export const processImage = async ({
  db,
  uploadDir,
  imageId,
  ownerId,
  width,
  height,
  filter,
  quality,
}: ProcessImageServiceParams): Promise<ApiProcessedImage> => {
  const image = await imagesRepo.findById({ db, id: imageId })
  if (!image || image.ownerId !== ownerId.value) {
    throw new ImageServiceError({
      code: ERROR_CODES.NOT_FOUND,
      message: IMAGE_NOT_FOUND_MESSAGE,
    })
  }

  const paramsHash = computeParamsHash({ width, height, filter, quality })

  const existing = await processedImagesRepo.findByImageAndParamsHash({ db, imageId, paramsHash })
  if (existing) {
    return toApiProcessedImage({ row: existing })
  }

  const mimeType = toAllowedImageMimeType({ value: image.mimeType })
  if (!mimeType) {
    // Upload validation is supposed to make this impossible, so a row outside jpeg/png/webp
    // means the invariant was broken upstream. Fail loudly rather than hand libvips a mime
    // type it was never validated against.
    throw new ImageDataInvariantError({
      message: `images.mime_type has an unsupported value: ${image.mimeType}`,
    })
  }

  const originalBuffer = await readUploadedFile({
    uploadDir,
    storagePath: new StorageKey(image.storagePath),
  })

  // `duration_ms` covers the sharp work only — decode, resize, filter, encode — not the db/fs
  // bookkeeping either side of it. The calls are chained rather than aliased into locals
  // because sharp's builder mutates and returns the same instance: they are one pipeline.
  const start = performance.now()
  const { data } = await encodeInSourceFormat({
    pipeline: applyFilter({
      pipeline: sharp(originalBuffer).resize(width, height, { fit: 'inside' }),
      filter,
    }),
    mimeType,
    quality,
  }).toBuffer({ resolveWithObject: true })
  const durationMs = Math.round(performance.now() - start)

  const storagePath = new StorageKey(
    `${PROCESSED_PREFIX}/${imageId.value}/${paramsHash}.${MIME_EXTENSIONS[mimeType]}`,
  )
  await writeUploadedFile({ uploadDir, storagePath, data })

  try {
    const row = await processedImagesRepo.create({
      db,
      imageId,
      paramsHash,
      width,
      height,
      filter,
      quality,
      storagePath,
      durationMs,
    })
    return toApiProcessedImage({ row })
  } catch (error) {
    // Two identical concurrent requests can both miss the lookup above and both finish the
    // sharp work; only one insert wins the unique index. The loser must return the winner's
    // row, so re-read whatever the error was — matching on SQLSTATE never fires here (drizzle
    // puts the pg code on `.cause`) and a saturated pool fails differently anyway. Rethrow
    // untouched when the row still is not there: a real failure must not become a false 200.
    const winner = await processedImagesRepo
      .findByImageAndParamsHash({ db, imageId, paramsHash })
      .catch(() => {
        throw error
      })

    if (winner) {
      return toApiProcessedImage({ row: winner })
    }
    throw error
  }
}
