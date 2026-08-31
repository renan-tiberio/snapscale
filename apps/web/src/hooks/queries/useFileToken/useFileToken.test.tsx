import { ERROR_CODES, fail, ok } from '@snapscale/shared'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useFileToken } from './useFileToken'

import type { UseFileTokenResult } from './useFileToken'
import type { RenderHookResult } from '@testing-library/react'

import { createFileTokenWithTtlMs } from '@/test/jwt'
import { API_BASE, TEST_FILE_TOKEN } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { createHookWrapper, seedSession } from '@/test/utils'

type MockFileTokenResponsesParams = { nextToken: () => string }

const mockFileTokenResponses = ({ nextToken }: MockFileTokenResponsesParams) => {
  server.use(
    http.get(`${API_BASE}/auth/file-token`, () =>
      HttpResponse.json(ok({ data: { token: nextToken() } })),
    ),
  )
}

describe('useFileToken', () => {
  let result: RenderHookResult<UseFileTokenResult, unknown>['result']

  const renderUseFileToken = () =>
    renderHook(() => useFileToken(), { wrapper: createHookWrapper() }).result

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('never fetches a file token while there is no session', () => {
    let requested = false
    server.use(
      http.get(`${API_BASE}/auth/file-token`, () => {
        requested = true
        return HttpResponse.json(ok({ data: { token: TEST_FILE_TOKEN } }))
      }),
    )

    result = renderUseFileToken()

    expect(result.current.fileToken).toBeNull()
    expect(requested).toBe(false)
  })

  describe('with a session', () => {
    beforeEach(() => {
      seedSession()
    })

    it('fetches the short-lived, scope-limited token image URLs should use', async () => {
      result = renderUseFileToken()

      await waitFor(() => {
        expect(result.current.fileToken).toBe(TEST_FILE_TOKEN)
      })
      expect(result.current.error).toBeNull()
    })

    it('surfaces the error code and message when the file-token request fails', async () => {
      server.use(
        http.get(`${API_BASE}/auth/file-token`, () =>
          HttpResponse.json(
            fail({ code: ERROR_CODES.UNAUTHORIZED, message: 'Invalid or expired token' }),
            { status: 401 },
          ),
        ),
      )

      result = renderUseFileToken()

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
            return HttpResponse.json(fail({ code: ERROR_CODES.INTERNAL, message: 'boom' }), {
              status: 500,
            })
          }
          return HttpResponse.json(ok({ data: { token: TEST_FILE_TOKEN } }))
        }),
      )

      result = renderUseFileToken()

      await waitFor(
        () => {
          expect(result.current.fileToken).toBe(TEST_FILE_TOKEN)
        },
        { timeout: 3_000 },
      )
      expect(attempt).toBeGreaterThanOrEqual(2)
    })

    it('treats an already-expired token as absent so the UI falls back to a placeholder', async () => {
      const expiredToken = createFileTokenWithTtlMs({ ttlMs: -10_000 })
      server.use(
        http.get(`${API_BASE}/auth/file-token`, () =>
          HttpResponse.json(ok({ data: { token: expiredToken } })),
        ),
      )

      result = renderUseFileToken()

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
      expect(result.current.fileToken).toBeNull()
    })

    it('schedules the next refresh around half the remaining life of the current token, not a fixed 30s tick', async () => {
      let callCount = 0
      mockFileTokenResponses({
        nextToken: () => {
          callCount += 1
          return createFileTokenWithTtlMs({ ttlMs: 20_000 })
        },
      })

      vi.useFakeTimers({ shouldAdvanceTime: true })
      renderUseFileToken()

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
      mockFileTokenResponses({
        nextToken: () => {
          callCount += 1
          return createFileTokenWithTtlMs({ ttlMs: 20_000 })
        },
      })

      vi.useFakeTimers({ shouldAdvanceTime: true })
      renderUseFileToken()

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
      mockFileTokenResponses({
        nextToken: () => {
          callCount += 1
          return TEST_FILE_TOKEN
        },
      })

      result = renderUseFileToken()
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
})
