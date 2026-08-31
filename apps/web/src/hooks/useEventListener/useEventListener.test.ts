import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useEventListener } from './useEventListener'

import type { Mock } from 'vitest'

describe('useEventListener', () => {
  let handler: Mock

  beforeEach(() => {
    handler = vi.fn()
  })

  it('invokes the handler when the window event fires', () => {
    renderHook(() => useEventListener({ target: window, type: 'online', handler }))

    window.dispatchEvent(new Event('online'))

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('always calls the latest handler without re-subscribing', () => {
    const firstHandler = vi.fn()
    const { rerender } = renderHook(
      ({ onEvent }) => useEventListener({ target: window, type: 'online', handler: onEvent }),
      { initialProps: { onEvent: firstHandler } },
    )

    const secondHandler = vi.fn()
    rerender({ onEvent: secondHandler })
    window.dispatchEvent(new Event('online'))

    expect(firstHandler).not.toHaveBeenCalled()
    expect(secondHandler).toHaveBeenCalledTimes(1)
  })

  it('subscribes to an element event and cleans up on unmount', () => {
    const element = document.createElement('button')
    document.body.appendChild(element)

    const { unmount } = renderHook(() =>
      useEventListener({ target: element, type: 'click', handler }),
    )
    element.click()

    expect(handler).toHaveBeenCalledTimes(1)

    unmount()
    element.click()

    expect(handler).toHaveBeenCalledTimes(1)
    document.body.removeChild(element)
  })

  it('does nothing while the element ref is null', () => {
    expect(() =>
      renderHook(() => useEventListener({ target: null, type: 'click', handler })),
    ).not.toThrow()
  })
})
