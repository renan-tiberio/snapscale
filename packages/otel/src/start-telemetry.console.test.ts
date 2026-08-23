import { trace } from '@opentelemetry/api'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { startTelemetry, type TelemetryHandle } from './start-telemetry.js'

describe('startTelemetry — enabled, console exporter', () => {
  let handle: TelemetryHandle | undefined

  afterEach(async () => {
    await handle?.shutdown()
    handle = undefined
  })

  it('emits a synthetic span through the console exporter', async () => {
    // ConsoleSpanExporter prints one line per span via `console.dir` (see
    // @opentelemetry/sdk-trace's ConsoleSpanExporter) — spying on it is an
    // observable-behavior assertion, not an internal of startTelemetry.
    const consoleDirSpy = vi.spyOn(console, 'dir').mockImplementation(() => undefined)

    handle = await startTelemetry(
      { serviceName: 'snapscale-otel-test' },
      { OTEL_ENABLED: 'true', OTEL_EXPORTER: 'console' },
    )

    const tracer = trace.getTracer('snapscale-otel-test-tracer')
    const span = tracer.startSpan('synthetic-test-span')
    span.end()

    // The default span processor batches — shutdown() forces a flush, which
    // is why the assertion runs after it rather than immediately.
    await handle.shutdown()

    expect(consoleDirSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'synthetic-test-span' }),
      expect.anything(),
    )

    consoleDirSpy.mockRestore()
  })
})
