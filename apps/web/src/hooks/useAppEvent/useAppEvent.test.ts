import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppEvent } from './useAppEvent'

import type { Mock } from 'vitest'

import { emitAppEvent } from '@/utils/events'

describe('useAppEvent', () => {
  let handler: Mock

  beforeEach(() => {
    handler = vi.fn()
  })

  it('invokes the handler when the app event fires', () => {
    renderHook(() => useAppEvent({ name: 'auth/logout', handler }))

    emitAppEvent({ name: 'auth/logout', payload: undefined })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('always calls the latest handler without re-subscribing', () => {
    const firstHandler = vi.fn()
    const { rerender } = renderHook(
      ({ onLogout }) => useAppEvent({ name: 'auth/logout', handler: onLogout }),
      { initialProps: { onLogout: firstHandler } },
    )

    const secondHandler = vi.fn()
    rerender({ onLogout: secondHandler })
    emitAppEvent({ name: 'auth/logout', payload: undefined })

    expect(firstHandler).not.toHaveBeenCalled()
    expect(secondHandler).toHaveBeenCalledTimes(1)
  })

  it('stops listening after unmount', () => {
    const { unmount } = renderHook(() => useAppEvent({ name: 'auth/logout', handler }))

    unmount()
    emitAppEvent({ name: 'auth/logout', payload: undefined })

    expect(handler).not.toHaveBeenCalled()
  })
})
