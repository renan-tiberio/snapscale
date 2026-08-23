import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from '@/db/schema.js'

/** Drizzle client bound to the api schema — the type every repository takes. */
export type Database = NodePgDatabase<typeof schema>

/** A pg pool plus the drizzle client that wraps it; `close()` drains the pool. */
export interface DatabaseHandle {
  readonly pool: Pool
  readonly db: Database
  close: () => Promise<void>
}

/**
 * Builds a pool + drizzle client for a connection string. A factory rather
 * than a module-level singleton so tests can point at a throwaway Postgres
 * (docs/05-decision-log.md decision 11) without touching process env.
 */
export function createDatabase(connectionString: string): DatabaseHandle {
  const pool = new Pool({ connectionString })

  return {
    pool,
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  }
}
