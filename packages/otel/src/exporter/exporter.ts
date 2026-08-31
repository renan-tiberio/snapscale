import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { ConsoleSpanExporter, type SpanExporter } from '@opentelemetry/sdk-trace-base'

import type { OtelEnv } from '../env/env.js'

// `console` (the default) prints spans to stdout; `otlp` ships them over HTTP
// to the collector/Jaeger endpoint in OTEL_EXPORTER_OTLP_ENDPOINT.
export const createTraceExporter = (env: OtelEnv): SpanExporter => {
  if (env.OTEL_EXPORTER === 'otlp') {
    // Spread rather than `{ url: env.OTEL_EXPORTER_OTLP_ENDPOINT }`: with
    // `exactOptionalPropertyTypes`, assigning an explicit `undefined` to an
    // optional key is not the same as omitting it — and omitting it is what
    // lets OTLPTraceExporter fall back to its own default endpoint.
    return new OTLPTraceExporter({
      ...(env.OTEL_EXPORTER_OTLP_ENDPOINT ? { url: env.OTEL_EXPORTER_OTLP_ENDPOINT } : {}),
    })
  }

  return new ConsoleSpanExporter()
}
