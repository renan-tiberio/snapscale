import type { Pool } from 'pg'

/** Drizzle client bound to the api schema — widened until the schema lands. */
export type Database = unknown

/** A pool plus the drizzle client that owns it; `close()` drains the pool. */
export interface DatabaseHandle {
  readonly pool: Pool
  readonly db: Database
  close: () => Promise<void>
}

export function createDatabase(connectionString: string): DatabaseHandle {
  throw new Error(`not implemented: createDatabase(${connectionString})`)
}
