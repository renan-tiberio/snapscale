import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runMigrations } from './migrate.js'

import { createTestDatabase, type TestDatabase } from '~/test/db.js'

/** Tables the api schema currently defines — docs/03-technical-design.md §6. */
const EXPECTED_TABLES = ['albums', 'images', 'otp_codes', 'processed_images', 'users']

const publicTables = async (database: TestDatabase): Promise<string[]> => {
  const result = await database.pool.query<{ table_name: string }>(
    `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`,
  )
  return result.rows.map((row) => row.table_name)
}

const appliedMigrations = async (database: TestDatabase): Promise<number> => {
  const result = await database.pool.query<{ count: string }>(
    'select count(*)::text from drizzle.__drizzle_migrations',
  )
  return Number(result.rows[0]?.count ?? '-1')
}

describe('runMigrations', () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase({ migrate: false })
  })

  afterEach(async () => {
    await database.destroy()
  })

  it('creates every api table on a fresh database', async () => {
    await runMigrations({ db: database.db })

    expect(await publicTables(database)).toEqual(EXPECTED_TABLES)
  })

  it('is idempotent — a second run applies nothing and keeps existing rows', async () => {
    await runMigrations({ db: database.db })
    const appliedAfterFirstRun = await appliedMigrations(database)
    await database.pool.query('insert into users (email) values ($1)', ['ada@example.com'])

    await runMigrations({ db: database.db })

    expect(await appliedMigrations(database)).toBe(appliedAfterFirstRun)
    expect(await publicTables(database)).toEqual(EXPECTED_TABLES)
    const survivors = await database.pool.query<{ email: string }>('select email from users')
    expect(survivors.rows).toEqual([{ email: 'ada@example.com' }])
  })
})
