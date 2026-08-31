import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAuth } from './useAuth'

import type { UseAuthResult } from './useAuth'
import type { RenderHookResult } from '@testing-library/react'

import { createHookWrapper, seedSession } from '@/test/utils'

const EMAIL = 'renan@example.com'

describe('useAuth', () => {
  let result: RenderHookResult<UseAuthResult, unknown>['result']

  describe('without a persisted session', () => {
    beforeEach(() => {
      result = renderHook(() => useAuth(), { wrapper: createHookWrapper() }).result
    })

    it('reports the code as sent after requesting an OTP', async () => {
      result.current.requestOtp({ email: EMAIL })

      await waitFor(() => {
        expect(result.current.isOtpRequested).toBe(true)
      })
    })

    it('exposes the verified user as the active session', async () => {
      result.current.verifyOtp({ email: EMAIL, code: '123456' })

      await waitFor(() => {
        expect(result.current.user?.email).toBe(EMAIL)
      })
      expect(result.current.isAuthenticated).toBe(true)
    })

    it('surfaces the error code and message when the code is rejected', async () => {
      result.current.verifyOtp({ email: EMAIL, code: '000000' })

      await waitFor(() => {
        expect(result.current.verifyError?.message).toBe('Invalid or expired code')
      })
      expect(result.current.verifyError?.code).toBe('UNAUTHORIZED')
      expect(result.current.isAuthenticated).toBe(false)
    })
  })

  describe('with a persisted session', () => {
    beforeEach(() => {
      seedSession()
      result = renderHook(() => useAuth(), { wrapper: createHookWrapper() }).result
    })

    it('starts authenticated when a session is already persisted', () => {
      expect(result.current.isAuthenticated).toBe(true)
    })

    it('drops the session on logout', async () => {
      act(() => {
        result.current.logout()
      })

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(false)
      })
      expect(result.current.user).toBeNull()
    })
  })
})
