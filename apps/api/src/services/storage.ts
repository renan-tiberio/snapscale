import { mkdir, readFile, writeFile } from 'node:fs/promises'
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
