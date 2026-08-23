import { describe, expect, it } from 'vitest'

import { createInstrumentations } from './instrumentations.js'

describe('createInstrumentations', () => {
  it('enables exactly http, pg and fastify — no other auto-instrumentation', () => {
    const instrumentations = createInstrumentations()
    const names = instrumentations.map((instrumentation) => instrumentation.instrumentationName)

    expect(new Set(names)).toEqual(
      new Set([
        '@opentelemetry/instrumentation-http',
        '@opentelemetry/instrumentation-pg',
        '@opentelemetry/instrumentation-fastify',
      ]),
    )
  })
})
