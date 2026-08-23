import type { Database } from '@/db/index.js'

export function runMigrations(db: Database): Promise<void> {
  throw new Error(`not implemented: runMigrations(${typeof db})`)
}
