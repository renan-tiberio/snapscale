import { loadConfig } from '@/config.js'
import { createDatabase } from '@/db/index.js'
import { runMigrations } from '@/db/migrate.js'

/**
 * `pnpm db:migrate` — applies pending migrations to `DATABASE_URL` and exits.
 * Safe to run on every deploy: `runMigrations` is idempotent.
 */
const database = createDatabase(loadConfig().DATABASE_URL)

try {
  await runMigrations(database.db)
} finally {
  await database.close()
}
