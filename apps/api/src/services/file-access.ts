import { ERROR_CODES } from '@snapscale/shared'

import type { Database } from '@/db/index.js'

import * as imagesRepo from '@/repositories/images.js'
import * as processedImagesRepo from '@/repositories/processed-images.js'
import { isWithinUploadDir, resolveUploadPath } from '@/services/storage.js'

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
}

/**
 * Resolves the `GET /files/*` wildcard (docs/03 §7) to an absolute path iff
 * it both (a) stays inside `UPLOAD_DIR` and (b) belongs to `ownerId` — an
 * `images` row for originals, or a `processed_images` row (joined back to
 * its source image for the mime type) for processed output. Any failure —
 * traversal, unknown path, or wrong owner — is the exact same 404.
 */
export async function resolveOwnedFile(
  deps: FileAccessDeps,
  storagePath: string,
  ownerId: string,
): Promise<OwnedFile> {
  if (!isWithinUploadDir(deps.uploadDir, storagePath)) {
    throw new FileAccessError(ERROR_CODES.NOT_FOUND, 'File not found')
  }

  const image = await imagesRepo.findByStoragePathForOwner(deps.db, storagePath, ownerId)
  if (image) {
    return { absolutePath: resolveUploadPath(deps.uploadDir, storagePath), mimeType: image.mimeType }
  }

  const processed = await processedImagesRepo.findByStoragePathForOwner(deps.db, storagePath, ownerId)
  if (processed) {
    const sourceImage = await imagesRepo.findById(deps.db, processed.imageId)
    return {
      absolutePath: resolveUploadPath(deps.uploadDir, storagePath),
      mimeType: sourceImage?.mimeType ?? 'application/octet-stream',
    }
  }

  throw new FileAccessError(ERROR_CODES.NOT_FOUND, 'File not found')
}
