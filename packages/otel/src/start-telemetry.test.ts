import { describe, expect, it, vi } from 'vitest'

import { startTelemetry } from './start-telemetry.js'

// A spy standing in for the real Node SDK class. Asserting on this spy (not
// on any internal state of startTelemetry) is the "flag, not internals"
// mechanism the task calls for: if OTEL_ENABLED is off, this constructor —
// and therefore `.start()` — must never run.
const nodeSdkStartSpy = vi.fn()
const nodeSdkShutdownSpy = vi.fn().mockResolvedValue(undefined)
const nodeSdkConstructorSpy = vi.fn()

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: class {
    constructor(...args: unknown[]) {
      nodeSdkConstructorSpy(...args)
    }

    start(): void {
      nodeSdkStartSpy()
    }

    shutdown(): Promise<void> {
      return nodeSdkShutdownSpy()
    }
  },
}))

describe('startTelemetry', () => {
  it('returns a handle exposing shutdown()', async () => {
    const handle = await startTelemetry({ serviceName: 'snapscale-test' }, {})

    expect(typeof handle.shutdown).toBe('function')
  })

  it('never constructs or starts the Node SDK when OTEL_ENABLED is unset', async () => {
    await startTelemetry({ serviceName: 'snapscale-test' }, {})

    expect(nodeSdkConstructorSpy).not.toHaveBeenCalled()
    expect(nodeSdkStartSpy).not.toHaveBeenCalled()
  })

  it('never constructs or starts the Node SDK when OTEL_ENABLED=false', async () => {
    await startTelemetry({ serviceName: 'snapscale-test' }, { OTEL_ENABLED: 'false' })

    expect(nodeSdkConstructorSpy).not.toHaveBeenCalled()
    expect(nodeSdkStartSpy).not.toHaveBeenCalled()
  })

  it('starts the Node SDK when OTEL_ENABLED=true', async () => {
    await startTelemetry({ serviceName: 'snapscale-test' }, { OTEL_ENABLED: 'true' })

    expect(nodeSdkConstructorSpy).toHaveBeenCalledTimes(1)
    expect(nodeSdkStartSpy).toHaveBeenCalledTimes(1)
  })

  it('resolves shutdown() when telemetry was never started (disabled no-op handle)', async () => {
    const handle = await startTelemetry({ serviceName: 'snapscale-test' }, {})

    await expect(handle.shutdown()).resolves.toBeUndefined()
  })

  it('resolves shutdown() when telemetry was started, delegating to the SDK', async () => {
    const handle = await startTelemetry({ serviceName: 'snapscale-test' }, { OTEL_ENABLED: 'true' })

    await expect(handle.shutdown()).resolves.toBeUndefined()
    expect(nodeSdkShutdownSpy).toHaveBeenCalledTimes(1)
  })

  it('crashes naming the field for a bad OTEL_EXPORTER value, enabled or not', async () => {
    await expect(
      startTelemetry({ serviceName: 'snapscale-test' }, { OTEL_EXPORTER: 'bogus' }),
    ).rejects.toThrowError(/OTEL_EXPORTER/)
  })
})
