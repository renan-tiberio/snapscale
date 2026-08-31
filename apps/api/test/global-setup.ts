import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'

import { startMailhogContainer, type StartedMailhog } from './mailhog-container.js'

import type { GlobalSetupContext } from 'vitest/node'

/**
 * One throwaway Postgres per run — never the compose instance on 5433
 * (docs/05-decision-log.md decision 11); testcontainers picks a random host
 * port so this never collides with a developer's running stack. Each test
 * file creates its own database inside it (`test/db.ts`) for per-file
 * isolation without paying container startup per file.
 *
 * MailHog starts here too, for the contention reason documented in
 * `./mailhog-container.ts`. This file imports that module, never
 * `./mailhog.ts` — `globalSetup` runs in a context where importing `vitest`
 * corrupts vitest's own worker state; `./mailhog.ts` is what test files use
 * instead, via `inject()`.
 */
const POSTGRES_IMAGE = 'postgres:16-alpine'

declare module 'vitest' {
  // `type` cannot participate in declaration merging — vitest's `ProvidedContext`
  // can only be augmented via `interface` (docs/06-code-standards.md §2).
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface ProvidedContext {
    /** Admin connection URI of the throwaway container (points at its default database). */
    postgresUri: string
  }
}

let postgres: StartedPostgreSqlContainer | undefined
let mailhog: StartedMailhog | undefined

export const setup = async ({ provide }: GlobalSetupContext): Promise<void> => {
  const [startedPostgres, startedMailhog] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).start(),
    startMailhogContainer(),
  ])

  postgres = startedPostgres
  mailhog = startedMailhog

  provide('postgresUri', postgres.getConnectionUri())
  provide('mailhogConnection', mailhog.connection)
}

export const teardown = async (): Promise<void> => {
  await Promise.all([postgres?.stop(), mailhog?.stop()])
  postgres = undefined
  mailhog = undefined
}
