import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit only — the runtime never reads this file. SQL is generated
 * (`pnpm db:generate`) and committed under `migrations/`, then applied by
 * `src/db/migrate.ts`; `drizzle-kit push` is deliberately not part of the
 * workflow, so schema changes always arrive as a reviewable migration.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
})
