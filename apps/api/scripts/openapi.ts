import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Mailer } from '@/services/mailer/index.js'

import { buildApp } from '@/app/index.js'
import { createDatabase } from '@/db/index.js'

/**
 * `pnpm --filter @snapscale/api openapi` — writes the OpenAPI document `@fastify/swagger`
 * builds from the live route registrations to stdout, and nothing else. No listener, no
 * query and no mail is sent, so it runs with Postgres and MailHog down.
 */

const OTP_TTL_SECONDS = 600 // 10 minutes
const JSON_INDENT_SPACES = 2

/** Every route that needs a database is mounted, but no handler runs, so nothing ever dials it. */
const UNUSED_DATABASE_URL = 'postgres://openapi@127.0.0.1:5432/openapi'

/** `buildApp` mounts the JWT-dependent routes only when a secret is present; no token is signed here. */
const UNUSED_JWT_SECRET = 'openapi-generation-only'

const NO_OP_MAILER: Mailer = { sendMail: async () => undefined }

const database = createDatabase({ connectionString: UNUSED_DATABASE_URL })
const uploadDir = await mkdtemp(join(tmpdir(), 'snapscale-openapi-'))

try {
  const app = await buildApp({
    logger: false,
    db: database.db,
    mailer: NO_OP_MAILER,
    jwtSecret: UNUSED_JWT_SECRET,
    otpTtlSeconds: OTP_TTL_SECONDS,
    uploadDir,
  })
  await app.ready()
  process.stdout.write(`${JSON.stringify(app.swagger(), null, JSON_INDENT_SPACES)}\n`)
  await app.close()
} finally {
  await database.close()
  await rm(uploadDir, { recursive: true, force: true })
}
