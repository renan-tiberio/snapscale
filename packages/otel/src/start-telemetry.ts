import { loadOtelEnv } from './env.js'

export interface TelemetryOptions {
  /** Value for the OTel `service.name` resource attribute. */
  serviceName: string
  /** Value for `service.version`; the attribute is omitted when not given. */
  serviceVersion?: string
}

export interface TelemetryHandle {
  /**
   * Flushes and stops the SDK. Resolves even when telemetry was never
   * started (disabled) — callers can always `await handle.shutdown()`
   * unconditionally in their `onClose`/exit path.
   */
  shutdown: () => Promise<void>
}

const NOOP_HANDLE: TelemetryHandle = {
  shutdown: () => Promise.resolve(),
}

/**
 * Boots OpenTelemetry tracing for this process (docs/03-technical-design.md
 * §8, docs/04-implementation-plan.md task 10).
 *
 * Every OTel import lives behind the `OTEL_ENABLED` check as a *dynamic*
 * import: when telemetry is off (the default), this function does nothing
 * but a couple of zod-validated `process.env` reads. The Node SDK, its
 * auto-instrumentations and the exporters are never loaded into the
 * process — not merely "constructed but not started" — which is the "zero
 * overhead" contract from the task.
 *
 * `env` is an injectable override of `process.env`, mirroring
 * `apps/api/src/config.ts#loadConfig` — tests never touch real env vars.
 */
export async function startTelemetry(
  options: TelemetryOptions,
  env: Record<string, string | undefined> = process.env,
): Promise<TelemetryHandle> {
  const otelEnv = loadOtelEnv(env)

  if (!otelEnv.OTEL_ENABLED) {
    return NOOP_HANDLE
  }

  const [
    { NodeSDK },
    { resourceFromAttributes },
    { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION },
    { createTraceExporter },
    { createInstrumentations },
  ] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/semantic-conventions'),
    import('./exporter.js'),
    import('./instrumentations.js'),
  ])

  const resourceAttributes: Record<string, string> = {
    [ATTR_SERVICE_NAME]: options.serviceName,
    // Only environment this lab ever runs in until phase 4's k3d move —
    // revisited then, not guessed at now.
    'deployment.environment': 'local',
  }
  if (options.serviceVersion) {
    resourceAttributes[ATTR_SERVICE_VERSION] = options.serviceVersion
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes(resourceAttributes),
    traceExporter: createTraceExporter(otelEnv),
    instrumentations: createInstrumentations(),
  })

  sdk.start()

  return {
    shutdown: () => sdk.shutdown(),
  }
}
