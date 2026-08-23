import { describe, expect, it, vi } from 'vitest'

import { startBrowserTelemetry } from './telemetry'

describe('startBrowserTelemetry', () => {
  it('does nothing when VITE_OTEL_ENABLED is unset', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    startBrowserTelemetry({})

    expect(consoleInfoSpy).not.toHaveBeenCalled()
    consoleInfoSpy.mockRestore()
  })

  it('does nothing when VITE_OTEL_ENABLED is any value other than the string "true"', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    startBrowserTelemetry({ VITE_OTEL_ENABLED: 'nope' })

    expect(consoleInfoSpy).not.toHaveBeenCalled()
    consoleInfoSpy.mockRestore()
  })

  it('logs a boot notice when VITE_OTEL_ENABLED="true"', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    startBrowserTelemetry({ VITE_OTEL_ENABLED: 'true' })

    expect(consoleInfoSpy).toHaveBeenCalledTimes(1)
    consoleInfoSpy.mockRestore()
  })
})
