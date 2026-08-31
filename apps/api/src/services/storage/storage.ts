import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

import type { StorageKey } from '@snapscale/shared'

/** The two subtrees of `UPLOAD_DIR`; every storage key starts with one of them. */
export const ORIGINALS_PREFIX = 'originals'
export const PROCESSED_PREFIX = 'processed'

const ETAG_RADIX = 16

type EnsureUploadDirParams = {
  readonly uploadDir: string
}

/** Called once at boot, so the first upload does not race on creating the tree. */
export const ensureUploadDir = async ({ uploadDir }: EnsureUploadDirParams): Promise<void> => {
  await mkdir(join(uploadDir, ORIGINALS_PREFIX), { recursive: true })
}

type UploadedFileParams = {
  readonly uploadDir: string
  readonly storagePath: StorageKey
}

export const resolveUploadPath = ({ uploadDir, storagePath }: UploadedFileParams): string =>
  join(uploadDir, storagePath.value)

type WriteUploadedFileParams = UploadedFileParams & {
  readonly data: Buffer
}

export const writeUploadedFile = async ({
  uploadDir,
  storagePath,
  data,
}: WriteUploadedFileParams): Promise<void> => {
  const absolutePath = resolveUploadPath({ uploadDir, storagePath })
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, data)
}

/** Tolerates "already gone": this is the compensating unlink for a row insert that failed. */
export const removeUploadedFile = async ({
  uploadDir,
  storagePath,
}: UploadedFileParams): Promise<void> => {
  await unlink(resolveUploadPath({ uploadDir, storagePath })).catch(() => undefined)
}

export type UploadedFileStat = {
  readonly sizeBytes: number
  readonly modifiedAtMs: number
}

/**
 * `undefined` when the blob is not on disk. Callers must check before streaming: a
 * `createReadStream` on a missing file only fails once the 200 headers are already on the
 * wire, which turns a clean 404 envelope into a truncated 200. The same `stat` feeds the ETag.
 */
export const statUploadedFile = async ({
  uploadDir,
  storagePath,
}: UploadedFileParams): Promise<UploadedFileStat | undefined> => {
  try {
    const stats = await stat(resolveUploadPath({ uploadDir, storagePath }))
    return { sizeBytes: stats.size, modifiedAtMs: stats.mtimeMs }
  } catch {
    return undefined
  }
}

/** `private`: the bytes belong to one account and must never sit in a shared cache. */
export const FILE_CACHE_CONTROL = 'private, max-age=60, must-revalidate'

type BuildFileETagParams = {
  readonly stats: UploadedFileStat
}

/**
 * Stored blobs are never rewritten in place, so size + mtime identifies the content. Without
 * a validator the `?token=` rotation every 60s would re-fetch every byte on the page.
 */
export const buildFileETag = ({ stats }: BuildFileETagParams): string =>
  `"${stats.sizeBytes.toString(ETAG_RADIX)}-${Math.trunc(stats.modifiedAtMs).toString(ETAG_RADIX)}"`

export const readUploadedFile = async ({
  uploadDir,
  storagePath,
}: UploadedFileParams): Promise<Buffer> => readFile(resolveUploadPath({ uploadDir, storagePath }))

type IsWithinUploadDirParams = {
  readonly uploadDir: string
  /** Raw, not a `StorageKey`: this is the check that decides whether the path is usable at all. */
  readonly storagePath: string
}

/**
 * True if `storagePath` resolves inside `uploadDir` — the traversal check for path-derived
 * requests. Joining alone does not stop `../` segments, so the resolved absolute path is
 * walked back against the resolved root.
 */
export const isWithinUploadDir = ({ uploadDir, storagePath }: IsWithinUploadDirParams): boolean => {
  const root = resolve(uploadDir)
  const target = resolve(join(uploadDir, storagePath))
  return target === root || target.startsWith(root + sep)
}
