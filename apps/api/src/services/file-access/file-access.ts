import { ERROR_CODES, ImageId, StorageKey } from '@snapscale/shared'

import type { Database } from '@/db/index.js'
import type { UserId } from '@snapscale/shared'

import * as imagesRepo from '@/repositories/images/index.js'
import * as processedImagesRepo from '@/repositories/processed-images/index.js'
import {
  buildFileETag,
  isWithinUploadDir,
  resolveUploadPath,
  statUploadedFile,
} from '@/services/storage/index.js'

const FILE_NOT_FOUND_MESSAGE = 'File not found'
/** A processed blob whose source image has gone: still served, just without a specific type. */
const FALLBACK_MIME_TYPE = 'application/octet-stream'

export type FileAccessErrorParams = {
  readonly code: string
  readonly message: string
}

/** The route maps every code onto 404 — this must never become an ownership/existence oracle. */
export class FileAccessError extends Error {
  readonly code: string

  constructor({ code, message }: FileAccessErrorParams) {
    super(message)
    this.name = 'FileAccessError'
    this.code = code
  }
}

const fileNotFound = (): FileAccessError =>
  new FileAccessError({ code: ERROR_CODES.NOT_FOUND, message: FILE_NOT_FOUND_MESSAGE })

type ToStorageKeyParams = {
  readonly value: string
}

/** `undefined` rather than a throw: an unusable path has to land on the same 404 as an unknown one. */
const toStorageKey = ({ value }: ToStorageKeyParams): StorageKey | undefined => {
  try {
    return new StorageKey(value)
  } catch {
    return undefined
  }
}

type ResolveOwnedMimeTypeParams = {
  readonly db: Database
  readonly storagePath: StorageKey
  readonly ownerId: UserId
}

/** The mime type of an owned original or processed output — `undefined` if neither matches. */
const resolveOwnedMimeType = async ({
  db,
  storagePath,
  ownerId,
}: ResolveOwnedMimeTypeParams): Promise<string | undefined> => {
  const image = await imagesRepo.findByStoragePathForOwner({ db, storagePath, ownerId })
  if (image) {
    return image.mimeType
  }

  const processed = await processedImagesRepo.findByStoragePathForOwner({
    db,
    storagePath,
    ownerId,
  })
  if (!processed) {
    return undefined
  }

  const sourceImage = await imagesRepo.findById({ db, id: new ImageId(processed.imageId) })
  return sourceImage?.mimeType ?? FALLBACK_MIME_TYPE
}

export type OwnedFile = {
  readonly absolutePath: string
  readonly mimeType: string
  /** Validator for `If-None-Match`, so a rotated `?token=` costs a 304, not a re-download. */
  readonly etag: string
}

type ResolveOwnedFileParams = {
  readonly db: Database
  readonly uploadDir: string
  /** Comes straight off the `GET /files/*` wildcard, so it is untrusted until checked below. */
  readonly storagePath: string
  readonly ownerId: UserId
}

/**
 * Resolves the `GET /files/*` wildcard to an absolute path iff it stays inside `UPLOAD_DIR`,
 * belongs to `ownerId` (an `images` row for originals, a `processed_images` row joined back to
 * its source image for processed output) and is actually on disk. Traversal, unknown path,
 * wrong owner and missing blob are deliberately the exact same 404.
 *
 * The on-disk check is not paranoia about ownership: `createReadStream` on a missing file only
 * errors after the 200 headers are flushed, which turns a clean envelope into a truncated body.
 * The same `stat` yields the ETag.
 */
export const resolveOwnedFile = async ({
  db,
  uploadDir,
  storagePath,
  ownerId,
}: ResolveOwnedFileParams): Promise<OwnedFile> => {
  if (!isWithinUploadDir({ uploadDir, storagePath })) {
    throw fileNotFound()
  }

  const storageKey = toStorageKey({ value: storagePath })
  if (!storageKey) {
    throw fileNotFound()
  }

  const mimeType = await resolveOwnedMimeType({ db, storagePath: storageKey, ownerId })
  if (!mimeType) {
    throw fileNotFound()
  }

  const stats = await statUploadedFile({ uploadDir, storagePath: storageKey })
  if (!stats) {
    throw fileNotFound()
  }

  return {
    absolutePath: resolveUploadPath({ uploadDir, storagePath: storageKey }),
    mimeType,
    etag: buildFileETag({ stats }),
  }
}
