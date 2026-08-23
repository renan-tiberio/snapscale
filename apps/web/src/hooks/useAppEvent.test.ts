import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useAppEvent } from './useAppEvent'

import { emitAppEvent } from '@/utils/events'

describe('useAppEvent', () => {
  it('invokes the handler when the app event fires', () => {
    const handler = vi.fn()
    renderHook(() => useAppEvent('auth/logout', handler))

    emitAppEvent('auth/logout', undefined)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('always calls the latest handler without re-subscribing', () => {
    const firstHandler = vi.fn()
    const { rerender } = renderHook(
      ({ onLogout }) => useAppEvent('auth/logout', onLogout),
      { initialProps: { onLogout: firstHandler } },
    )

    const secondHandler = vi.fn()
    rerender({ onLogout: secondHandler })
    emitAppEvent('auth/logout', undefined)

    expect(firstHandler).not.toHaveBeenCalled()
    expect(secondHandler).toHaveBeenCalledTimes(1)
  })

  it('stops listening after unmount', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useAppEvent('auth/logout', handler))

    unmount()
    emitAppEvent('auth/logout', undefined)

    expect(handler).not.toHaveBeenCalled()
  })
})
