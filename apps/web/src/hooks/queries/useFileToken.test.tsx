import { ERROR_CODES, fail, ok } from '@snapscale/shared'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useFileToken } from './useFileToken'

import { API_BASE, TEST_FILE_TOKEN } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { createFileTokenWithTtlMs } from '@/test/jwt'
import { createHookWrapper, seedSession } from '@/test/utils'

function renderUseFileToken() {
  seedSession()
  return renderHook(() => useFileToken(), { wrapper: createHookWrapper() })
}

function mockFileTokenResponses(tokens: () => string) {
  server.use(
    http.get(`${API_BASE}/auth/file-token`, () => HttpResponse.json(ok({ token: tokens() }))),
  )
}

describe('useFileToken', () => {
  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('fetches the short-lived, scope-limited token image URLs should use', async () => {
    const { result } = renderUseFileToken()

    await waitFor(() => {
      expect(result.current.fileToken).toBe(TEST_FILE_TOKEN)
    })
    expect(result.current.error).toBeNull()
  })

  it('never fetches a file token while there is no session', () => {
    let requested = false
    server.use(
      http.get(`${API_BASE}/auth/file-token`, () => {
        requested = true
        return HttpResponse.json(ok({ token: TEST_FILE_TOKEN }))
      }),
    )

    const { result } = renderHook(() => useFileToken(), { wrapper: createHookWrapper() })

    expect(result.current.fileToken).toBeNull()
    expect(requested).toBe(false)
  })

  it('surfaces the error code and message when the file-token request fails', async () => {
    server.use(
      http.get(`${API_BASE}/auth/file-token`, () =>
        HttpResponse.json(fail(ERROR_CODES.UNAUTHORIZED, 'Invalid or expired token'), { status: 401 }),
      ),
    )
    const { result } = renderUseFileToken()

    await waitFor(
      () => {
        expect(result.current.error?.code).toBe(ERROR_CODES.UNAUTHORIZED)
      },
      { timeout: 3_000 },
    )
    expect(result.current.error?.message).toBe('Invalid or expired token')
  })

  it('retries a failed fetch instead of leaving the query dead after one failure', async () => {
    let attempt = 0
    server.use(
      http.get(`${API_BASE}/auth/file-token`, () => {
        attempt += 1
        if (attempt === 1) {
          return HttpResponse.json(fail(ERROR_CODES.INTERNAL, 'boom'), { status: 500 })
        }
        return HttpResponse.json(ok({ token: TEST_FILE_TOKEN }))
      }),
    )

    const { result } = renderUseFileToken()

    await waitFor(
      () => {
        expect(result.current.fileToken).toBe(TEST_FILE_TOKEN)
      },
      { timeout: 3_000 },
    )
    expect(attempt).toBeGreaterThanOrEqual(2)
  })

  it('treats an already-expired token as absent so the UI falls back to a placeholder', async () => {
    const expiredToken = createFileTokenWithTtlMs(-10_000)
    server.use(
      http.get(`${API_BASE}/auth/file-token`, () => HttpResponse.json(ok({ token: expiredToken }))),
    )

    const { result } = renderUseFileToken()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.fileToken).toBeNull()
  })

  it('schedules the next refresh around half the remaining life of the current token, not a fixed 30s tick', async () => {
    let callCount = 0
    mockFileTokenResponses(() => {
      callCount += 1
      return createFileTokenWithTtlMs(20_000)
    })

    vi.useFakeTimers({ shouldAdvanceTime: true })
    seedSession()
    renderHook(() => useFileToken(), { wrapper: createHookWrapper() })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(callCount).toBe(1)

    // Half of a 20s TTL is 10s — nothing should refetch before that.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000)
    })
    expect(callCount).toBe(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    expect(callCount).toBe(2)
  })

  it('keeps refreshing on schedule even while the tab is in the background', async () => {
    let callCount = 0
    mockFileTokenResponses(() => {
      callCount += 1
      return createFileTokenWithTtlMs(20_000)
    })

    vi.useFakeTimers({ shouldAdvanceTime: true })
    seedSession()
    renderHook(() => useFileToken(), { wrapper: createHookWrapper() })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(callCount).toBe(1)

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000)
    })

    expect(callCount).toBe(2)
  })

  it('exposes a refresh that forces a fresh fetch on demand', async () => {
    let callCount = 0
    mockFileTokenResponses(() => {
      callCount += 1
      return TEST_FILE_TOKEN
    })

    const { result } = renderUseFileToken()
    await waitFor(() => {
      expect(result.current.fileToken).toBe(TEST_FILE_TOKEN)
    })
    const callsBeforeRefresh = callCount

    act(() => {
      result.current.refresh()
    })

    await waitFor(() => {
      expect(callCount).toBeGreaterThan(callsBeforeRefresh)
    })
  })
})
