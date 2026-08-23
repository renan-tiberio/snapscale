import { z } from 'zod'

/**
 * Runtime configuration contract for the api service — see
 * `docs/03-technical-design.md` §3. Every var is validated at boot; a
 * missing or invalid value throws naming the offending field so
 * misconfiguration fails loud instead of surfacing as a mystery 500 later.
 */
const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SMTP_HOST: z.string().min(1, 'SMTP_HOST is required'),
  SMTP_PORT: z.coerce.number().int().positive(),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  UPLOAD_DIR: z.string().min(1, 'UPLOAD_DIR is required'),
})

export type Config = z.infer<typeof configSchema>

/**
 * Validates `process.env` (or an injected env map, for tests) against the
 * schema above. Throws a single Error naming every offending field —
 * never returns a partially-valid config.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = configSchema.safeParse(env)

  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))].join(', ')
    throw new Error(`Invalid environment configuration — offending field(s): ${fields}`)
  }

  return result.data
}
