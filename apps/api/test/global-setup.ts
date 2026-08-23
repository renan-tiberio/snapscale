import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'

import { startMailhogContainer, type StartedMailhog } from './mailhog-container.js'

import type { GlobalSetupContext } from 'vitest/node'

/**
 * One throwaway Postgres per test run — never the compose instance on 5433
 * (docs/05-decision-log.md decision 11). Testcontainers picks a random host
 * port, so nothing here can collide with a developer's running stack.
 *
 * Each test file then creates its **own** database inside this container
 * (`test/db.ts`), which gives the isolation decision 11 asks for without
 * paying container startup per file.
 *
 * FIX-E: MailHog is started here too, for the same reason — see the comment
 * on `startMailhogContainer` in `./mailhog-container.ts` for why running it
 * from a test file's `beforeAll` made it flaky. `connectToMailhog()` (in
 * `./mailhog.ts`) is what test files use to reach the container this starts;
 * they purge the inbox between tests for isolation instead of getting their
 * own container. `./mailhog-container.ts` is a separate module from
 * `./mailhog.ts` specifically so this file never transitively imports
 * `vitest` — `globalSetup` runs in a separate context where doing so breaks
 * vitest's own worker state.
 */
const POSTGRES_IMAGE = 'postgres:16-alpine'

declare module 'vitest' {
  interface ProvidedContext {
    /** Admin connection URI of the throwaway container (points at its default database). */
    postgresUri: string
  }
}

let postgres: StartedPostgreSqlContainer | undefined
let mailhog: StartedMailhog | undefined

export async function setup({ provide }: GlobalSetupContext): Promise<void> {
  const [startedPostgres, startedMailhog] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).start(),
    startMailhogContainer(),
  ])

  postgres = startedPostgres
  mailhog = startedMailhog

  provide('postgresUri', postgres.getConnectionUri())
  provide('mailhogConnection', mailhog.connection)
}

export async function teardown(): Promise<void> {
  await Promise.all([postgres?.stop(), mailhog?.stop()])
  postgres = undefined
  mailhog = undefined
}
