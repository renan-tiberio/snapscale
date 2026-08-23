import { describe, expect, it, vi } from 'vitest'

import { createInstrumentations } from './instrumentations.js'

// Regression test for a real bug caught via the U10 live-boot proof:
// `getNodeAutoInstrumentations()`'s instrumentation constructors call
// `enable()` — installing the require-in-the-middle patch — immediately
// unless their own config disables them (see instrumentations.ts's doc
// comment). A `.filter()` on the *returned array* alone is too late: it
// only controls what NodeSDK registers, not what already got patched at
// construction. This asserts the config object handed to
// `getNodeAutoInstrumentations()` itself disables everything but http/pg —
// the fix has to happen before construction, not after.
type AutoInstrumentationsConfig = Record<string, { enabled?: boolean }>

const getNodeAutoInstrumentationsSpy = vi.fn(
  (config: AutoInstrumentationsConfig): unknown[] => {
    void config
    return []
  },
)

function lastConfig(): AutoInstrumentationsConfig {
  const call = getNodeAutoInstrumentationsSpy.mock.calls[0]
  if (!call) {
    throw new Error('getNodeAutoInstrumentations was not called')
  }
  return call[0]
}

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: (config: AutoInstrumentationsConfig) =>
    getNodeAutoInstrumentationsSpy(config),
}))

vi.mock('@opentelemetry/instrumentation-fastify', () => ({
  FastifyInstrumentation: class {
    instrumentationName = '@opentelemetry/instrumentation-fastify'
  },
}))

describe('createInstrumentations — auto-instrumentations-node config', () => {
  it('disables dns (a representative bundled instrumentation) before construction', () => {
    createInstrumentations()

    expect(getNodeAutoInstrumentationsSpy).toHaveBeenCalledTimes(1)
    expect(lastConfig()['@opentelemetry/instrumentation-dns']).toEqual({ enabled: false })
  })

  it('leaves http and pg enabled', () => {
    createInstrumentations()

    expect(lastConfig()['@opentelemetry/instrumentation-http']).toEqual({ enabled: true })
    expect(lastConfig()['@opentelemetry/instrumentation-pg']).toEqual({ enabled: true })
  })
})
