import { z } from 'zod'

// The two exporter backends supported today — no metrics backend yet.
const EXPORTER_KINDS = ['console', 'otlp'] as const

export type OtelExporterKind = (typeof EXPORTER_KINDS)[number]

export type OtelEnv = {
  OTEL_ENABLED: boolean
  OTEL_EXPORTER: OtelExporterKind
  // `exactOptionalPropertyTypes` requires `| undefined` here: zod's parsed
  // output keeps the key present (set to `undefined`) rather than omitting
  // it, and the two are distinct under that flag.
  OTEL_EXPORTER_OTLP_ENDPOINT?: string | undefined
}

const otelEnvSchema = z.object({
  // Env vars are always strings; `undefined` (unset) resolves to `false` —
  // the documented default — without needing a separate `.default()`.
  OTEL_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  OTEL_EXPORTER: z.enum(EXPORTER_KINDS).default('console'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
})

// Runs unconditionally — even when OTEL_ENABLED is false — so a typo in
// OTEL_EXPORTER fails loud at boot instead of only once telemetry is enabled.
export const loadOtelEnv = (env: Record<string, string | undefined> = process.env): OtelEnv => {
  const result = otelEnvSchema.safeParse(env)

  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))].join(
      ', ',
    )
    throw new Error(`Invalid OTEL environment configuration — offending field(s): ${fields}`)
  }

  return result.data
}
