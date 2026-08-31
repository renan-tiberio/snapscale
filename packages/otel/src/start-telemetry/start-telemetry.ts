import { loadOtelEnv } from '../env/env.js'

export type TelemetryOptions = {
  /** Value for the OTel `service.name` resource attribute. */
  serviceName: string
  /** Value for `service.version`; the attribute is omitted when not given. */
  serviceVersion?: string
}

export type TelemetryHandle = {
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

type StartTelemetryParams = TelemetryOptions & {
  /** Injectable override of `process.env` — tests never touch real env vars. */
  env?: Record<string, string | undefined>
}

// Every OTel import is dynamic: when OTEL_ENABLED is false, the SDK, its
// auto-instrumentations and the exporters must never load into the process
// at all — a static import would pull them into every process unconditionally,
// including the test suite.
export const startTelemetry = async ({
  serviceName,
  serviceVersion,
  env = process.env,
}: StartTelemetryParams): Promise<TelemetryHandle> => {
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
    import('../exporter/exporter.js'),
    import('../instrumentations/instrumentations.js'),
  ])

  const resourceAttributes: Record<string, string> = {
    [ATTR_SERVICE_NAME]: serviceName,
    // Only environment this lab runs in today; revisited if that changes.
    'deployment.environment': 'local',
    ...(serviceVersion ? { [ATTR_SERVICE_VERSION]: serviceVersion } : {}),
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
