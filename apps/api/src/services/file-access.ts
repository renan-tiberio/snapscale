import { ERROR_CODES } from '@snapscale/shared'

import type { Database } from '@/db/index.js'

import * as imagesRepo from '@/repositories/images.js'
import * as processedImagesRepo from '@/repositories/processed-images.js'
import {
  buildFileETag,
  isWithinUploadDir,
  resolveUploadPath,
  statUploadedFile,
} from '@/services/storage.js'

/** Thrown by this module; the route maps every code onto 404 — never an ownership/existence oracle. */
export class FileAccessError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'FileAccessError'
    this.code = code
  }
}

export interface FileAccessDeps {
  readonly db: Database
  readonly uploadDir: string
}

export interface OwnedFile {
  readonly absolutePath: string
  readonly mimeType: string
  /** Validator for `If-None-Match`, so a rotated `?token=` costs a 304, not a re-download. */
  readonly etag: string
}

/**
 * Resolves the `GET /files/*` wildcard (docs/03 §7) to an absolute path iff
 * it (a) stays inside `UPLOAD_DIR`, (b) belongs to `ownerId` — an `images`
 * row for originals, or a `processed_images` row (joined back to its source
 * image for the mime type) for processed output — and (c) is actually on
 * disk. Any failure — traversal, unknown path, wrong owner, missing blob —
 * is the exact same 404.
 *
 * (c) is not paranoia about (b): `createReadStream` on a missing file only
 * errors after the 200 headers have been flushed, which turns a clean
 * envelope into a truncated body. The same `stat` yields the ETag.
 */
export async function resolveOwnedFile(
  deps: FileAccessDeps,
  storagePath: string,
  ownerId: string,
): Promise<OwnedFile> {
  if (!isWithinUploadDir(deps.uploadDir, storagePath)) {
    throw new FileAccessError(ERROR_CODES.NOT_FOUND, 'File not found')
  }

  const mimeType = await resolveOwnedMimeType(deps, storagePath, ownerId)
  if (!mimeType) {
    throw new FileAccessError(ERROR_CODES.NOT_FOUND, 'File not found')
  }

  const stats = await statUploadedFile(deps.uploadDir, storagePath)
  if (!stats) {
    throw new FileAccessError(ERROR_CODES.NOT_FOUND, 'File not found')
  }

  return {
    absolutePath: resolveUploadPath(deps.uploadDir, storagePath),
    mimeType,
    etag: buildFileETag(stats),
  }
}

/** The mime type of an owned original or processed output — `undefined` if neither matches. */
async function resolveOwnedMimeType(
  deps: FileAccessDeps,
  storagePath: string,
  ownerId: string,
): Promise<string | undefined> {
  const image = await imagesRepo.findByStoragePathForOwner(deps.db, storagePath, ownerId)
  if (image) {
    return image.mimeType
  }

  const processed = await processedImagesRepo.findByStoragePathForOwner(deps.db, storagePath, ownerId)
  if (!processed) {
    return undefined
  }

  const sourceImage = await imagesRepo.findById(deps.db, processed.imageId)
  return sourceImage?.mimeType ?? 'application/octet-stream'
}
