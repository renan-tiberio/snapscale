import { z } from 'zod'

/** The two exporter backends supported in phase 1 — no metrics backend yet (docs/04 task 10). */
const EXPORTER_KINDS = ['console', 'otlp'] as const

export type OtelExporterKind = (typeof EXPORTER_KINDS)[number]

export interface OtelEnv {
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

/**
 * Validates the `OTEL_*` environment contract (`docs/03-technical-design.md`
 * §8). Runs unconditionally — even when `OTEL_ENABLED` is false — so a typo
 * in `OTEL_EXPORTER` fails loud at boot instead of surfacing only once
 * someone flips telemetry on later.
 */
export function loadOtelEnv(env: Record<string, string | undefined> = process.env): OtelEnv {
  const result = otelEnvSchema.safeParse(env)

  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))].join(
      ', ',
    )
    throw new Error(`Invalid OTEL environment configuration — offending field(s): ${fields}`)
  }

  return result.data
}
