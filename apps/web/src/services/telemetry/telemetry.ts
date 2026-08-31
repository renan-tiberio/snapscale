type StartBrowserTelemetryParams = {
  env?: Record<string, string | boolean | undefined>
}

/**
 * Browser telemetry stub: lands the on/off contract (`VITE_OTEL_ENABLED=true`)
 * without pulling the OpenTelemetry Web SDK's tracing/context-manager weight
 * into every page's bundle before there is anything client-side worth
 * tracing. Gives phase 2 a single call site to upgrade into the real SDK.
 *
 * `env` mirrors `apps/api/src/config.ts#loadConfig`'s injectable-env
 * pattern — defaults to `import.meta.env`, overridable in tests.
 */
export const startBrowserTelemetry = ({
  env = import.meta.env,
}: StartBrowserTelemetryParams = {}): void => {
  if (env.VITE_OTEL_ENABLED !== 'true') {
    return
  }

  // eslint-disable-next-line no-console -- deliberate boot notice for this stub; no browser log pipeline exists yet to route it through instead
  console.info('[snapscale][otel] browser telemetry enabled (stub — phase 2 wires the real SDK)')
}
