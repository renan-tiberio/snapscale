import { randomUUID } from 'node:crypto'

import {
  ALLOWED_IMAGE_MIME_TYPES,
  ERROR_CODES,
  MAX_UPLOAD_BYTES,
  type AllowedImageMimeType,
  type Image as ApiImage,
} from '@snapscale/shared'
import sharp from 'sharp'

import type { Database } from '@/db/index.js'
import type { Image as ImageRow } from '@/repositories/images.js'

import * as albumsRepo from '@/repositories/albums.js'
import * as imagesRepo from '@/repositories/images.js'
import { resolveUploadPath, writeUploadedFile } from '@/services/storage.js'

/**
 * Thrown by this module; routes map `code` 1:1 onto the HTTP error envelope
 * (`NOT_FOUND` → 404, `VALIDATION_ERROR` → 422) — same pattern as
 * `services/otp.ts`'s `OtpServiceError`.
 */
export class ImageServiceError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ImageServiceError'
    this.code = code
  }
}

const MIME_EXTENSIONS: Record<AllowedImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * Maps sharp's detected `metadata.format` back onto the one mime type it
 * corresponds to. Deliberately closed to jpeg/png/webp: sharp (via libvips)
 * also happily parses svg/gif/tiff/heif/etc, and `metadata()` succeeding
 * with a `width`/`height` is NOT by itself proof of "a real jpeg/png/webp" —
 * an SVG (which can carry `<script>`) declared with `Content-Type: image/png`
 * parses fine and must still be rejected. This map is the actual magic-byte
 * check; `isAllowedMimeType` below only filters the request header.
 */
const FORMAT_MIME_TYPES: Partial<Record<string, AllowedImageMimeType>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

function isAllowedMimeType(value: string | undefined): value is AllowedImageMimeType {
  return value !== undefined && (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(value)
}

/**
 * Maps the db row onto the api's `Image` contract (`packages/shared`).
 * `width`/`height` are nullable columns (pre-existing rows without them),
 * but every row this module creates always sets them — a `null` here means
 * the row didn't come from `uploadImage`, which is a bug, not a 404.
 */
function toApiImage(row: ImageRow): ApiImage {
  if (row.width === null || row.height === null) {
    throw new Error(`imagesRepo row ${row.id} is missing width/height — expected uploadImage to set them`)
  }

  return {
    id: row.id,
    albumId: row.albumId,
    ownerId: row.ownerId,
    originalFilename: row.originalFilename,
    storagePath: row.storagePath,
    mimeType: row.mimeType as AllowedImageMimeType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export interface ImageServiceDeps {
  readonly db: Database
  readonly uploadDir: string
}

export interface UploadImageInput {
  readonly ownerId: string
  readonly albumId: string
  readonly originalFilename: string
  readonly mimeType: string | undefined
  readonly buffer: Buffer
}

/**
 * `POST /images` business logic (docs/03 §7): the album must belong to the
 * caller (else 404 — no ownership oracle), the mime header must be in the
 * allowlist, the byte size must fit `MAX_UPLOAD_BYTES`, and the content must
 * actually parse as an image via sharp's metadata read — the decisive check
 * that catches a text file renamed `.jpg` with a spoofed `Content-Type`.
 * Only once every check passes does the file hit disk.
 */
export async function uploadImage(deps: ImageServiceDeps, input: UploadImageInput): Promise<ApiImage> {
  const album = await albumsRepo.findById(deps.db, input.albumId, input.ownerId)
  if (!album) {
    throw new ImageServiceError(ERROR_CODES.NOT_FOUND, 'Album not found')
  }

  if (!isAllowedMimeType(input.mimeType)) {
    throw new ImageServiceError(
      ERROR_CODES.VALIDATION_ERROR,
      `Unsupported content type: ${input.mimeType ?? 'unknown'}`,
    )
  }

  if (input.buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new ImageServiceError(ERROR_CODES.VALIDATION_ERROR, 'File exceeds the maximum upload size')
  }

  const metadata = await sharp(input.buffer)
    .metadata()
    .catch(() => undefined)

  if (!metadata?.width || !metadata.height) {
    throw new ImageServiceError(
      ERROR_CODES.VALIDATION_ERROR,
      'File content does not parse as a valid image',
    )
  }

  // The decisive magic-byte check: sharp/libvips also parses svg, gif, tiff,
  // heif, etc — "it parsed" is not "it's a jpeg/png/webp". Reject unless the
  // *detected* format is one of the three allowed types, and matches what
  // the client declared. This is what actually stops an SVG (which can
  // carry `<script>`) uploaded with a spoofed `Content-Type: image/png`.
  const detectedMimeType = metadata.format ? FORMAT_MIME_TYPES[metadata.format] : undefined
  if (!detectedMimeType || detectedMimeType !== input.mimeType) {
    throw new ImageServiceError(
      ERROR_CODES.VALIDATION_ERROR,
      `File content does not match the declared content type (detected: ${metadata.format ?? 'unknown'})`,
    )
  }

  const imageId = randomUUID()
  const extension = MIME_EXTENSIONS[input.mimeType]
  const storagePath = `originals/${input.ownerId}/${imageId}.${extension}`

  await writeUploadedFile(deps.uploadDir, storagePath, input.buffer)

  const row = await imagesRepo.create(deps.db, {
    id: imageId,
    albumId: input.albumId,
    ownerId: input.ownerId,
    originalFilename: input.originalFilename,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.byteLength,
    storagePath,
    width: metadata.width,
    height: metadata.height,
  })

  return toApiImage(row)
}

/** `GET /images?albumId=` — the album must belong to the caller, else 404. */
export async function listImagesForAlbum(
  deps: ImageServiceDeps,
  albumId: string,
  ownerId: string,
): Promise<ApiImage[]> {
  const album = await albumsRepo.findById(deps.db, albumId, ownerId)
  if (!album) {
    throw new ImageServiceError(ERROR_CODES.NOT_FOUND, 'Album not found')
  }

  const rows = await imagesRepo.listByAlbum(deps.db, albumId)
  return rows.map(toApiImage)
}

/**
 * `GET /images/:id` — the entity, not the bytes (docs/03 §4).
 * `imagesRepo.findById` isn't owner-scoped, so ownership is checked here and
 * a foreign id throws the same NOT_FOUND as an unknown one.
 */
export async function getImage(deps: ImageServiceDeps, imageId: string, ownerId: string): Promise<ApiImage> {
  const image = await imagesRepo.findById(deps.db, imageId)
  if (!image || image.ownerId !== ownerId) {
    throw new ImageServiceError(ERROR_CODES.NOT_FOUND, 'Image not found')
  }

  return toApiImage(image)
}

export interface ImageFile {
  readonly absolutePath: string
  readonly mimeType: string
}

/**
 * `GET /images/:id/file` — `imagesRepo.findById` isn't owner-scoped (docs/03
 * §7 repo API), so ownership is checked here; a mismatch and a missing row
 * throw the exact same error, keeping the route free of an ownership oracle.
 */
export async function getImageFile(deps: ImageServiceDeps, imageId: string, ownerId: string): Promise<ImageFile> {
  const image = await imagesRepo.findById(deps.db, imageId)
  if (!image || image.ownerId !== ownerId) {
    throw new ImageServiceError(ERROR_CODES.NOT_FOUND, 'Image not found')
  }

  return {
    absolutePath: resolveUploadPath(deps.uploadDir, image.storagePath),
    mimeType: image.mimeType,
  }
}
