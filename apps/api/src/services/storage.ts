import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

/**
 * Filesystem access for `UPLOAD_DIR` (docs/03 §7). Kept tiny and isolated so
 * every write stays async — no sync IO ever lands in a route handler.
 */

/** Ensures `UPLOAD_DIR` (and its `originals/` subtree) exists — called once at boot. */
export async function ensureUploadDir(uploadDir: string): Promise<void> {
  await mkdir(join(uploadDir, 'originals'), { recursive: true })
}

export function resolveUploadPath(uploadDir: string, storagePath: string): string {
  return join(uploadDir, storagePath)
}

/** Writes `data` to `uploadDir/storagePath`, creating parent directories as needed. */
export async function writeUploadedFile(
  uploadDir: string,
  storagePath: string,
  data: Buffer,
): Promise<void> {
  const absolutePath = resolveUploadPath(uploadDir, storagePath)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, data)
}

/**
 * Deletes `uploadDir/storagePath`, tolerating "already gone". Used as the
 * compensating action when the row insert that should have claimed a written
 * blob fails — see `services/images.ts`.
 */
export async function removeUploadedFile(uploadDir: string, storagePath: string): Promise<void> {
  await unlink(resolveUploadPath(uploadDir, storagePath)).catch(() => undefined)
}

export interface UploadedFileStat {
  readonly sizeBytes: number
  readonly modifiedAtMs: number
}

/**
 * `stat` for a stored blob — `undefined` when it is not on disk.
 *
 * Two things need this before a byte is streamed. First, existence: a
 * `createReadStream` on a missing file only fails *after* the response
 * headers are on the wire, which turns a clean 404 envelope into a truncated
 * 200. Second, the ETag inputs below. One `stat` answers both.
 */
export async function statUploadedFile(
  uploadDir: string,
  storagePath: string,
): Promise<UploadedFileStat | undefined> {
  try {
    const stats = await stat(resolveUploadPath(uploadDir, storagePath))
    return { sizeBytes: stats.size, modifiedAtMs: stats.mtimeMs }
  } catch {
    return undefined
  }
}

/**
 * `Cache-Control` for every file-serving route. `private` because the bytes
 * belong to exactly one account and must never sit in a shared cache; the
 * short max-age matches the 60s file token that authorized the URL.
 */
export const FILE_CACHE_CONTROL = 'private, max-age=60, must-revalidate'

/**
 * Strong validator built from size + mtime. Stored blobs are immutable —
 * nothing ever rewrites an original or a processed output in place — so this
 * pair identifies the content. It exists because the `?token=` in an image
 * URL rotates every 60s: without a validator, every rotation would re-fetch
 * every byte of every image on the page.
 */
export function buildFileETag(stats: UploadedFileStat): string {
  return `"${stats.sizeBytes.toString(16)}-${Math.trunc(stats.modifiedAtMs).toString(16)}"`
}

/** Reads `uploadDir/storagePath` — the original bytes fed into sharp for `POST /images/process`. */
export async function readUploadedFile(uploadDir: string, storagePath: string): Promise<Buffer> {
  return readFile(resolveUploadPath(uploadDir, storagePath))
}

/**
 * True if `storagePath` resolves to a location inside `uploadDir` — the
 * traversal check for path-derived requests (`GET /files/*`, docs/03 §7).
 * `resolveUploadPath` alone does not protect against `../` segments in
 * `storagePath`; this walks the fully resolved absolute path back against
 * the resolved root and rejects anything that lands outside it.
 */
export function isWithinUploadDir(uploadDir: string, storagePath: string): boolean {
  const root = resolve(uploadDir)
  const target = resolve(resolveUploadPath(uploadDir, storagePath))
  return target === root || target.startsWith(root + sep)
}
