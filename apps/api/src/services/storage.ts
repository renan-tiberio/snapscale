import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

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
