import { getTableColumns, getTableName, type Table } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabase, type DatabaseHandle } from '@/db/index.js'
import { albums, images, otpCodes, processedImages, users } from '@/db/schema.js'
import { createTestDatabase, type TestDatabase } from '~/test/db.js'

/**
 * `index.ts` is this folder's fixed entrypoint and `schema.ts` its sibling, so one test file
 * named after the folder covers both rather than a loose test beside each.
 */
const SCHEMA_TABLES: readonly Table[] = [users, otpCodes, albums, images, processedImages]

type ColumnNamesParams = {
  readonly table: Table
}

/** A set, not an array: `information_schema` has its own row order and it is not the contract. */
const declaredColumnNames = ({ table }: ColumnNamesParams): Set<string> =>
  new Set(Object.values(getTableColumns(table)).map((column) => column.name))

describe('db schema', () => {
  let database: TestDatabase

  beforeAll(async () => {
    database = await createTestDatabase()
  }, 60_000)

  afterAll(async () => {
    await database.destroy()
  })

  it('declares exactly the tables the migrations create', async () => {
    const result = await database.pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`,
    )

    const migrated = result.rows.map((row) => row.table_name)
    for (const table of SCHEMA_TABLES) {
      expect(migrated).toContain(getTableName(table))
    }
  })

  it('matches the migrated columns of every table, name for name', async () => {
    for (const table of SCHEMA_TABLES) {
      const result = await database.pool.query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = $1`,
        [getTableName(table)],
      )

      expect(new Set(result.rows.map((row) => row.column_name))).toEqual(
        declaredColumnNames({ table }),
      )
    }
  })
})

describe('createDatabase', () => {
  let database: TestDatabase
  let handle: DatabaseHandle

  beforeAll(async () => {
    database = await createTestDatabase()
    handle = createDatabase({ connectionString: database.url })
  }, 60_000)

  afterAll(async () => {
    await handle.close()
    await database.destroy()
  })

  it('binds a pool that answers a query against the given connection string', async () => {
    const result = await handle.pool.query<{ one: number }>('select 1 as one')

    expect(result.rows[0]?.one).toBe(1)
  })

  it('exposes a drizzle client that reads through the api schema', async () => {
    const rows = await handle.db.select().from(users)

    expect(rows).toEqual([])
  })

  // Its own handle: draining the one `beforeAll` built would make the two tests above
  // fail whenever the runner puts this test first.
  it('drains the pool on close, so a later query is refused', async () => {
    const drained = createDatabase({ connectionString: database.url })
    await drained.close()

    await expect(drained.pool.query('select 1')).rejects.toThrow()
  })
})
