import { loadConfig } from '@/config/index.js'
import { createDatabase } from '@/db/index.js'
import { runMigrations } from '@/db/migrate/index.js'

/**
 * `pnpm db:migrate` — applies pending migrations to `DATABASE_URL` and exits.
 * Safe to run on every deploy: `runMigrations` is idempotent.
 */
const database = createDatabase({ connectionString: loadConfig().DATABASE_URL })

try {
  await runMigrations({ db: database.db })
} finally {
  await database.close()
}
