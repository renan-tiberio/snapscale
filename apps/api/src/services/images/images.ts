import { randomUUID } from 'node:crypto'

import {
  ERROR_CODES,
  ImageId,
  StorageKey,
  imageUploadConstraintsSchema,
  type AllowedImageMimeType,
  type AlbumId,
  type Image as ApiImage,
  type UserId,
} from '@snapscale/shared'
import sharp from 'sharp'

import type { Database } from '@/db/index.js'
import type { Image as ImageRow } from '@/repositories/images/index.js'
import type { ZodIssue } from 'zod'

import * as albumsRepo from '@/repositories/albums/index.js'
import * as imagesRepo from '@/repositories/images/index.js'
import { ALBUM_NOT_FOUND_MESSAGE } from '@/services/albums/index.js'
import {
  ORIGINALS_PREFIX,
  buildFileETag,
  removeUploadedFile,
  resolveUploadPath,
  statUploadedFile,
  writeUploadedFile,
} from '@/services/storage/index.js'

/** The one wording for a missing (or foreign) image — the image-processing service sends it too. */
export const IMAGE_NOT_FOUND_MESSAGE = 'Image not found'

export type ImageServiceErrorParams = {
  readonly code: string
  readonly message: string
}

/**
 * Routes map `code` 1:1 onto the HTTP error envelope (`NOT_FOUND` → 404, `VALIDATION_ERROR` →
 * 422) — the same pattern as `services/otp`'s `OtpServiceError`.
 */
export class ImageServiceError extends Error {
  readonly code: string

  constructor({ code, message }: ImageServiceErrorParams) {
    super(message)
    this.name = 'ImageServiceError'
    this.code = code
  }
}

export type ImageRowIntegrityErrorParams = {
  readonly message: string
}

/**
 * A persisted row broke an invariant the write path guarantees. Deliberately not an
 * `ImageServiceError`: routes map that one onto 404/422, and a corrupt row is neither the
 * caller's fault nor a missing resource — it has to reach the 500 branch.
 */
export class ImageRowIntegrityError extends Error {
  constructor({ message }: ImageRowIntegrityErrorParams) {
    super(message)
    this.name = 'ImageRowIntegrityError'
  }
}

/** Stored blobs keep their source format, so the extension follows the mime type. */
export const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const satisfies Record<AllowedImageMimeType, string>

/**
 * Maps sharp's detected `metadata.format` onto the one mime type it corresponds to.
 * Deliberately closed to jpeg/png/webp: libvips also parses svg/gif/tiff/heif, and
 * `metadata()` returning a width/height is not proof of "a real jpeg/png/webp".
 */
const FORMAT_MIME_TYPES: Readonly<Partial<Record<string, AllowedImageMimeType>>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

type ToAllowedImageMimeTypeParams = {
  readonly value: string | undefined
}

/**
 * `undefined` for anything outside the allowlist. Parsing with the shared schema rather than a
 * hand-rolled predicate keeps one declaration of "allowed" and needs no cast to narrow.
 */
export const toAllowedImageMimeType = ({
  value,
}: ToAllowedImageMimeTypeParams): AllowedImageMimeType | undefined => {
  const parsed = imageUploadConstraintsSchema.shape.mimeType.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

type UploadConstraintMessageParams = {
  readonly issue: ZodIssue | undefined
  readonly mimeType: string | undefined
}

/**
 * Zod's own text ("Invalid enum value. Expected 'image/jpeg' | …") would leak the schema shape,
 * so the first issue is mapped onto the api's own wording rather than forwarded.
 */
const uploadConstraintMessage = ({ issue, mimeType }: UploadConstraintMessageParams): string => {
  if (issue?.path[0] === 'mimeType') {
    return `Unsupported content type: ${mimeType ?? 'unknown'}`
  }
  if (issue?.code === 'too_big') {
    return 'File exceeds the maximum upload size'
  }
  return 'Uploaded file is empty'
}

type ToApiImageParams = {
  readonly row: ImageRow
}

/**
 * `width`/`height` are nullable columns and `mime_type` is plain `text`, enforced only on the
 * upload path. A violation here means the row did not come from `uploadImage` — a bug, not a
 * 404 — so it throws instead of being cast away.
 */
const toApiImage = ({ row }: ToApiImageParams): ApiImage => {
  if (row.width === null || row.height === null) {
    throw new ImageRowIntegrityError({
      message: `imagesRepo row ${row.id} is missing width/height — expected uploadImage to set them`,
    })
  }

  const mimeType = toAllowedImageMimeType({ value: row.mimeType })
  if (!mimeType) {
    throw new ImageRowIntegrityError({
      message: `imagesRepo row ${row.id} has an unsupported mimeType ${row.mimeType} — outside the allowlist`,
    })
  }

  return {
    id: row.id,
    albumId: row.albumId,
    ownerId: row.ownerId,
    originalFilename: row.originalFilename,
    storagePath: row.storagePath,
    mimeType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

type UploadImageParams = {
  readonly db: Database
  readonly uploadDir: string
  readonly ownerId: UserId
  readonly albumId: AlbumId
  readonly originalFilename: string
  readonly mimeType: string | undefined
  readonly buffer: Buffer
}

/**
 * `POST /images`: the album must belong to the caller (else 404 — no ownership oracle), the
 * declared mime type and byte size must satisfy the shared upload constraints, and the content
 * must parse as that exact format. Only once every check passes does the file hit disk.
 */
export const uploadImage = async ({
  db,
  uploadDir,
  ownerId,
  albumId,
  originalFilename,
  mimeType,
  buffer,
}: UploadImageParams): Promise<ApiImage> => {
  const album = await albumsRepo.findById({ db, id: albumId, ownerId })
  if (!album) {
    throw new ImageServiceError({
      code: ERROR_CODES.NOT_FOUND,
      message: ALBUM_NOT_FOUND_MESSAGE,
    })
  }

  const constraints = imageUploadConstraintsSchema.safeParse({
    mimeType,
    sizeBytes: buffer.byteLength,
  })
  if (!constraints.success) {
    throw new ImageServiceError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: uploadConstraintMessage({ issue: constraints.error.issues[0], mimeType }),
    })
  }
  const declaredMimeType = constraints.data.mimeType

  const metadata = await sharp(buffer)
    .metadata()
    .catch(() => undefined)

  if (!metadata?.width || !metadata.height) {
    throw new ImageServiceError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'File content does not parse as a valid image',
    })
  }

  // The decisive magic-byte check. libvips parses svg, gif, tiff and heif too, so "it parsed"
  // is not "it is a jpeg/png/webp": this is what stops an SVG (which can carry `<script>`)
  // uploaded with a spoofed `Content-Type: image/png`.
  const detectedMimeType = metadata.format ? FORMAT_MIME_TYPES[metadata.format] : undefined
  if (!detectedMimeType || detectedMimeType !== declaredMimeType) {
    throw new ImageServiceError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: `File content does not match the declared content type (detected: ${metadata.format ?? 'unknown'})`,
    })
  }

  const imageId = new ImageId(randomUUID())
  const storagePath = new StorageKey(
    `${ORIGINALS_PREFIX}/${ownerId.value}/${imageId.value}.${MIME_EXTENSIONS[declaredMimeType]}`,
  )

  // The blob has to land first — the storage path is derived from the id, and the row must
  // never point at bytes that are not there yet. That ordering leaves an orphan blob behind a
  // failed insert, which nothing would ever collect, so the write is compensated explicitly.
  await writeUploadedFile({ uploadDir, storagePath, data: buffer })

  try {
    const row = await imagesRepo.create({
      db,
      id: imageId,
      albumId,
      ownerId,
      originalFilename,
      mimeType: declaredMimeType,
      sizeBytes: buffer.byteLength,
      storagePath,
      width: metadata.width,
      height: metadata.height,
    })

    return toApiImage({ row })
  } catch (error) {
    await removeUploadedFile({ uploadDir, storagePath })
    throw error
  }
}

type ListImagesForAlbumParams = {
  readonly db: Database
  readonly albumId: AlbumId
  readonly ownerId: UserId
}

/** `GET /images?albumId=` — the album must belong to the caller, else 404. */
export const listImagesForAlbum = async ({
  db,
  albumId,
  ownerId,
}: ListImagesForAlbumParams): Promise<ApiImage[]> => {
  const album = await albumsRepo.findById({ db, id: albumId, ownerId })
  if (!album) {
    throw new ImageServiceError({
      code: ERROR_CODES.NOT_FOUND,
      message: ALBUM_NOT_FOUND_MESSAGE,
    })
  }

  const rows = await imagesRepo.listByAlbum({ db, albumId })
  return rows.map((row) => toApiImage({ row }))
}

type GetImageParams = {
  readonly db: Database
  readonly imageId: ImageId
  readonly ownerId: UserId
}

/**
 * `GET /images/:id` — the entity, not the bytes. `imagesRepo.findById` is not owner-scoped, so
 * ownership is checked here and a foreign id throws the same NOT_FOUND as an unknown one.
 */
export const getImage = async ({ db, imageId, ownerId }: GetImageParams): Promise<ApiImage> => {
  const image = await imagesRepo.findById({ db, id: imageId })
  if (!image || image.ownerId !== ownerId.value) {
    throw new ImageServiceError({
      code: ERROR_CODES.NOT_FOUND,
      message: IMAGE_NOT_FOUND_MESSAGE,
    })
  }

  return toApiImage({ row: image })
}

export type ImageFile = {
  readonly absolutePath: string
  readonly mimeType: string
  /** Validator for `If-None-Match`, so a rotated `?token=` costs a 304, not a re-download. */
  readonly etag: string
}

type GetImageFileParams = GetImageParams & {
  readonly uploadDir: string
}

/**
 * `GET /images/:id/file`. A foreign owner, a missing row and a blob that has vanished from disk
 * all throw the same error: the route must not become an ownership oracle, and a
 * `createReadStream` failure only surfaces once the 200 headers are already on the wire.
 */
export const getImageFile = async ({
  db,
  uploadDir,
  imageId,
  ownerId,
}: GetImageFileParams): Promise<ImageFile> => {
  const image = await imagesRepo.findById({ db, id: imageId })
  if (!image || image.ownerId !== ownerId.value) {
    throw new ImageServiceError({
      code: ERROR_CODES.NOT_FOUND,
      message: IMAGE_NOT_FOUND_MESSAGE,
    })
  }

  const storagePath = new StorageKey(image.storagePath)
  const stats = await statUploadedFile({ uploadDir, storagePath })
  if (!stats) {
    throw new ImageServiceError({
      code: ERROR_CODES.NOT_FOUND,
      message: IMAGE_NOT_FOUND_MESSAGE,
    })
  }

  return {
    absolutePath: resolveUploadPath({ uploadDir, storagePath }),
    mimeType: image.mimeType,
    etag: buildFileETag({ stats }),
  }
}
