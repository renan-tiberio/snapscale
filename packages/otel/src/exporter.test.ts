import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'
import { describe, expect, it, vi } from 'vitest'

import { createTraceExporter } from './exporter.js'

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn(),
}))

describe('createTraceExporter', () => {
  it('returns a ConsoleSpanExporter for the console exporter kind', () => {
    const exporter = createTraceExporter({ OTEL_ENABLED: true, OTEL_EXPORTER: 'console' })

    expect(exporter).toBeInstanceOf(ConsoleSpanExporter)
  })

  it('constructs an OTLPTraceExporter pointed at OTEL_EXPORTER_OTLP_ENDPOINT for the otlp kind', () => {
    createTraceExporter({
      OTEL_ENABLED: true,
      OTEL_EXPORTER: 'otlp',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318/v1/traces',
    })

    expect(OTLPTraceExporter).toHaveBeenCalledWith({
      url: 'http://collector:4318/v1/traces',
    })
  })
})
