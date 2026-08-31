import { describe, expect, it } from 'vitest'

import { loadOtelEnv } from './env.js'

describe('loadOtelEnv', () => {
  it('defaults OTEL_ENABLED to false and OTEL_EXPORTER to console when unset', () => {
    const env = loadOtelEnv({})

    expect(env).toEqual({ OTEL_ENABLED: false, OTEL_EXPORTER: 'console' })
  })

  it('defaults OTEL_ENABLED to false when explicitly set to a non-"true" string', () => {
    const env = loadOtelEnv({ OTEL_ENABLED: 'nope' })

    expect(env.OTEL_ENABLED).toBe(false)
  })

  it('parses OTEL_ENABLED=true as enabled', () => {
    const env = loadOtelEnv({ OTEL_ENABLED: 'true' })

    expect(env.OTEL_ENABLED).toBe(true)
  })

  it('parses an explicit OTEL_EXPORTER=otlp', () => {
    const env = loadOtelEnv({ OTEL_EXPORTER: 'otlp' })

    expect(env.OTEL_EXPORTER).toBe('otlp')
  })

  it('carries OTEL_EXPORTER_OTLP_ENDPOINT through when it is a valid URL', () => {
    const env = loadOtelEnv({
      OTEL_EXPORTER: 'otlp',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318/v1/traces',
    })

    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://localhost:4318/v1/traces')
  })

  it('crashes naming the field when OTEL_EXPORTER is not a recognized value', () => {
    expect(() => loadOtelEnv({ OTEL_EXPORTER: 'bogus' })).toThrowError(/OTEL_EXPORTER/)
  })

  it('crashes naming the field when OTEL_EXPORTER_OTLP_ENDPOINT is not a valid URL', () => {
    expect(() =>
      loadOtelEnv({ OTEL_EXPORTER: 'otlp', OTEL_EXPORTER_OTLP_ENDPOINT: 'not-a-url' }),
    ).toThrowError(/OTEL_EXPORTER_OTLP_ENDPOINT/)
  })
})
