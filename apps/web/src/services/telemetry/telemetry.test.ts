import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { startBrowserTelemetry } from './telemetry'

import type { MockInstance } from 'vitest'

describe('startBrowserTelemetry', () => {
  let consoleInfoSpy: MockInstance<typeof console.info>

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleInfoSpy.mockRestore()
  })

  it('does nothing when VITE_OTEL_ENABLED is unset', () => {
    startBrowserTelemetry({ env: {} })

    expect(consoleInfoSpy).not.toHaveBeenCalled()
  })

  it('does nothing when VITE_OTEL_ENABLED is any value other than the string "true"', () => {
    startBrowserTelemetry({ env: { VITE_OTEL_ENABLED: 'nope' } })

    expect(consoleInfoSpy).not.toHaveBeenCalled()
  })

  it('logs a boot notice when VITE_OTEL_ENABLED="true"', () => {
    startBrowserTelemetry({ env: { VITE_OTEL_ENABLED: 'true' } })

    expect(consoleInfoSpy).toHaveBeenCalledTimes(1)
  })
})
