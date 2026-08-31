import { z } from 'zod'

const DEFAULT_PORT = 4000
const DEFAULT_OTP_TTL_SECONDS = 600 // 10 minutes
/** Vite's dev server origin; the only browser client today. Also the CORS allowlist fallback. */
export const DEFAULT_WEB_ORIGIN = 'http://localhost:5173'

/**
 * Runtime configuration contract for the api service. Every var is
 * validated at boot; a missing or invalid value throws naming the
 * offending field so misconfiguration fails loud instead of surfacing as a
 * mystery 500 later.
 */
const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SMTP_HOST: z.string().min(1, 'SMTP_HOST is required'),
  SMTP_PORT: z.coerce.number().int().positive(),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(DEFAULT_OTP_TTL_SECONDS),
  UPLOAD_DIR: z.string().min(1, 'UPLOAD_DIR is required'),
  WEB_ORIGIN: z.string().url().default(DEFAULT_WEB_ORIGIN),
  // Mirrors `@snapscale/otel#loadOtelEnv`'s contract, which `startTelemetry()`
  // enforces before this schema ever runs (see src/index.ts) — kept here too
  // so `Config` documents every env var this service reads, with matching
  // defaults for typing/documentation parity.
  OTEL_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  OTEL_EXPORTER: z.enum(['console', 'otlp']).default('console'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
})

export type Config = z.infer<typeof configSchema>

/**
 * Validates `process.env` (or an injected env map, for tests) against the
 * schema above. Throws a single Error naming every offending field — never
 * returns a partially-valid config.
 */
export const loadConfig = ({
  env = process.env,
}: { env?: Record<string, string | undefined> } = {}): Config => {
  const result = configSchema.safeParse(env)

  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))].join(
      ', ',
    )
    throw new Error(`Invalid environment configuration — offending field(s): ${fields}`)
  }

  return result.data
}
