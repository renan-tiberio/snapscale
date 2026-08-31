import { randomUUID } from 'node:crypto'

import { Client } from 'pg'
import { inject } from 'vitest'

import { createDatabase, type DatabaseHandle } from '@/db/index.js'
import { runMigrations } from '@/db/migrate/index.js'

/** Every table the api owns, ordered so a single TRUNCATE ... CASCADE is enough. */
const TABLES = ['processed_images', 'images', 'albums', 'otp_codes', 'users'] as const

export type TestDatabase = DatabaseHandle & {
  /** Connection string of the freshly created, test-owned database. */
  readonly url: string
  /** Closes the pool and drops the database from the shared container. */
  destroy: () => Promise<void>
}

const withAdminClient = async <T>({ run }: { run: (client: Client) => Promise<T> }): Promise<T> => {
  const client = new Client({ connectionString: inject('postgresUri') })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

/**
 * Creates an isolated database inside the run's throwaway container and (by
 * default) migrates it. One per test file keeps files from coupling through
 * shared rows — the false-positive class docs/03 §9 bans.
 */
export const createTestDatabase = async ({
  migrate = true,
}: { readonly migrate?: boolean } = {}): Promise<TestDatabase> => {
  const name = `test_${randomUUID().replaceAll('-', '')}`
  await withAdminClient({ run: (client) => client.query(`create database "${name}"`) })

  const url = new URL(inject('postgresUri'))
  url.pathname = `/${name}`
  const handle = createDatabase({ connectionString: url.toString() })

  if (migrate) {
    await runMigrations({ db: handle.db })
  }

  return {
    ...handle,
    url: url.toString(),
    destroy: async () => {
      await handle.close()
      await withAdminClient({
        run: (client) => client.query(`drop database "${name}" with (force)`),
      })
    },
  }
}

/** Empties every api table — call between tests inside a file. */
export const truncateAll = async ({ handle }: { handle: DatabaseHandle }): Promise<void> => {
  await handle.pool.query(`truncate table ${TABLES.join(', ')} restart identity cascade`)
}

/** Counts rows in a table without going through a repository. */
export const countRows = async ({
  handle,
  table,
}: {
  handle: DatabaseHandle
  table: string
}): Promise<number> => {
  const result = await handle.pool.query<{ count: string }>(`select count(*)::text from ${table}`)
  return Number(result.rows[0]?.count ?? '-1')
}
