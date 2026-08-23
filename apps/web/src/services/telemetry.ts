/**
 * Browser telemetry — deliberately a stub, not the real OpenTelemetry Web
 * SDK (docs/04-implementation-plan.md task 10, deviation noted in the U10
 * report). `@opentelemetry/sdk-trace-web` + browser auto-instrumentations
 * pull tracing/context-manager machinery into every page's bundle; phase 1
 * has nothing yet worth tracing client-side, so that weight isn't justified
 * today. This module only lands the on/off contract
 * (`VITE_OTEL_ENABLED=true`) so phase 2 has a single call site to upgrade
 * into the real SDK instead of wiring a new one from scratch.
 *
 * `env` mirrors `apps/api/src/config.ts#loadConfig`'s injectable-env
 * pattern — defaults to `import.meta.env`, overridable in tests.
 */
export function startBrowserTelemetry(
  env: Record<string, string | boolean | undefined> = import.meta.env,
): void {
  if (env.VITE_OTEL_ENABLED !== 'true') {
    return
  }

  // Deliberate boot notice for this stub — not pino (server-only), and
  // there is no browser log pipeline yet to route this through instead.
  // eslint-disable-next-line no-console
  console.info('[snapscale][otel] browser telemetry enabled (stub — phase 2 wires the real SDK)')
}
