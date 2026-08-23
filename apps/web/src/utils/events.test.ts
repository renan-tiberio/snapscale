import { describe, expect, it, vi } from 'vitest'

import { emitAppEvent, subscribeAppEvent } from './events'

// Extends the event map for this spec only, proving the type is designed to
// grow — the real map ships with just `auth/logout` (see events.ts).
declare module './events' {
  interface AppEventMap {
    'test/payload': { count: number }
  }
}

describe('events', () => {
  it('delivers the payload to a subscribed handler', () => {
    const handler = vi.fn()
    const unsubscribe = subscribeAppEvent('auth/logout', handler)

    emitAppEvent('auth/logout', undefined)
    unsubscribe()

    // A `CustomEventInit.detail` of `undefined` is read back as `null` per the
    // DOM spec — this is real browser behavior, not a gap in our wrapper.
    expect(handler).toHaveBeenCalledWith(null)
  })

  it('delivers a typed, non-trivial payload to the handler', () => {
    const handler = vi.fn()
    const unsubscribe = subscribeAppEvent('test/payload', handler)

    emitAppEvent('test/payload', { count: 3 })
    unsubscribe()

    expect(handler).toHaveBeenCalledWith({ count: 3 })
  })

  it('stops delivering events after unsubscribe', () => {
    const handler = vi.fn()
    const unsubscribe = subscribeAppEvent('auth/logout', handler)
    unsubscribe()

    emitAppEvent('auth/logout', undefined)

    expect(handler).not.toHaveBeenCalled()
  })

  it('does not notify a handler subscribed to a different event name', () => {
    const handler = vi.fn()
    const unsubscribe = subscribeAppEvent('auth/logout', handler)

    emitAppEvent('test/payload', { count: 1 })
    unsubscribe()

    expect(handler).not.toHaveBeenCalled()
  })
})
