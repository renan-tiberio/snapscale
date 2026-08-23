import { ERROR_CODES, fail, ok } from '@snapscale/shared'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useFileToken } from './useFileToken'

import { API_BASE, TEST_FILE_TOKEN } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { createHookWrapper, seedSession } from '@/test/utils'

function renderUseFileToken() {
  seedSession()
  return renderHook(() => useFileToken(), { wrapper: createHookWrapper() })
}

describe('useFileToken', () => {
  afterEach(() => {
    vi.useRealTimers()
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

    await waitFor(() => {
      expect(result.current.error?.code).toBe(ERROR_CODES.UNAUTHORIZED)
    })
    expect(result.current.error?.message).toBe('Invalid or expired token')
  })

  it('refetches a fresh token well before the 60s server-side expiry', async () => {
    let callCount = 0
    server.use(
      http.get(`${API_BASE}/auth/file-token`, () => {
        callCount += 1
        return HttpResponse.json(ok({ token: `${TEST_FILE_TOKEN}-${callCount}` }))
      }),
    )

    vi.useFakeTimers({ shouldAdvanceTime: true })
    seedSession()
    const { result } = renderHook(() => useFileToken(), { wrapper: createHookWrapper() })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.fileToken).toBe(`${TEST_FILE_TOKEN}-1`)

    // The hook refetches every 30s — well ahead of the 60s server-side
    // expiry — so the cached token is never allowed to go stale for long.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000)
    })
    expect(callCount).toBeGreaterThanOrEqual(2)
  })
})
