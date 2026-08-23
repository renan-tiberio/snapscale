import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'

import type { GlobalSetupContext } from 'vitest/node'

/**
 * One throwaway Postgres per test run — never the compose instance on 5433
 * (docs/05-decision-log.md decision 11). Testcontainers picks a random host
 * port, so nothing here can collide with a developer's running stack.
 *
 * Each test file then creates its **own** database inside this container
 * (`test/db.ts`), which gives the isolation decision 11 asks for without
 * paying container startup per file.
 */
const POSTGRES_IMAGE = 'postgres:16-alpine'

declare module 'vitest' {
  interface ProvidedContext {
    /** Admin connection URI of the throwaway container (points at its default database). */
    postgresUri: string
  }
}

let container: StartedPostgreSqlContainer | undefined

export async function setup({ provide }: GlobalSetupContext): Promise<void> {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start()
  provide('postgresUri', container.getConnectionUri())
}

export async function teardown(): Promise<void> {
  await container?.stop()
  container = undefined
}
