import { fileURLToPath } from 'node:url'

import { migrate } from 'drizzle-orm/node-postgres/migrator'

import type { Database } from '@/db/index.js'

/**
 * Generated SQL lives next to the app (`apps/api/migrations`), which resolves
 * identically from `src/db/migrate` and from the compiled `dist/db/migrate`.
 */
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../migrations', import.meta.url))

/**
 * Applies every pending migration. Drizzle records applied hashes in
 * `drizzle.__drizzle_migrations`, so this is idempotent: safe on a fresh
 * volume and a no-op on an already-migrated database — the container entrypoint
 * can call it on every boot.
 */
export const runMigrations = async ({ db }: { db: Database }): Promise<void> => {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
}
