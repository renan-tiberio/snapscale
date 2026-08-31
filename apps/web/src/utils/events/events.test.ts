import { beforeEach, describe, expect, it, vi } from 'vitest'

import { emitAppEvent, subscribeAppEvent } from './events'

import type { Mock } from 'vitest'

// Extends the event map for this spec only, proving the type is designed to
// grow — the real map ships with just `auth/logout` (see events.ts).
declare module './events' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- declaration merging into AppEventMap requires an interface
  interface AppEventMap {
    'test/payload': { count: number }
  }
}

describe('events', () => {
  let handler: Mock

  beforeEach(() => {
    handler = vi.fn()
  })

  it('delivers the payload to a subscribed handler', () => {
    const unsubscribe = subscribeAppEvent({ name: 'auth/logout', handler })

    emitAppEvent({ name: 'auth/logout', payload: undefined })
    unsubscribe()

    // A `CustomEventInit.detail` of `undefined` is read back as `null` per the
    // DOM spec — this is real browser behavior, not a gap in our wrapper.
    expect(handler).toHaveBeenCalledWith(null)
  })

  it('delivers a typed, non-trivial payload to the handler', () => {
    const unsubscribe = subscribeAppEvent({ name: 'test/payload', handler })

    emitAppEvent({ name: 'test/payload', payload: { count: 3 } })
    unsubscribe()

    expect(handler).toHaveBeenCalledWith({ count: 3 })
  })

  it('stops delivering events after unsubscribe', () => {
    const unsubscribe = subscribeAppEvent({ name: 'auth/logout', handler })
    unsubscribe()

    emitAppEvent({ name: 'auth/logout', payload: undefined })

    expect(handler).not.toHaveBeenCalled()
  })

  it('does not notify a handler subscribed to a different event name', () => {
    const unsubscribe = subscribeAppEvent({ name: 'auth/logout', handler })

    emitAppEvent({ name: 'test/payload', payload: { count: 1 } })
    unsubscribe()

    expect(handler).not.toHaveBeenCalled()
  })
})
