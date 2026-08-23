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
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  // Mirrors the contract `@snapscale/otel#loadOtelEnv` enforces at telemetry
  // boot (docs/03 §8) — kept here too so `Config` stays the one place that
  // documents every env var this service reads. `startTelemetry()` runs
  // before this schema is parsed (see src/index.ts), so the actual
  // fail-fast-on-bad-value behavior lives in the otel package; these fields
  // are optional with the same defaults for documentation/typing parity.
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
 * schema above. Throws a single Error naming every offending field —
 * never returns a partially-valid config.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = configSchema.safeParse(env)

  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))].join(
      ', ',
    )
    throw new Error(`Invalid environment configuration — offending field(s): ${fields}`)
  }

  return result.data
}
