import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createHookWrapper, seedSession } from '@/test/utils'

import { useAuth } from './useAuth'

const EMAIL = 'renan@example.com'

describe('useAuth', () => {
  it('reports the code as sent after requesting an OTP', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createHookWrapper() })

    result.current.requestOtp(EMAIL)

    await waitFor(() => {
      expect(result.current.isOtpRequested).toBe(true)
    })
  })

  it('exposes the verified user as the active session', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createHookWrapper() })

    result.current.verifyOtp({ email: EMAIL, code: '123456' })

    await waitFor(() => {
      expect(result.current.user?.email).toBe(EMAIL)
    })
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('surfaces the error code and message when the code is rejected', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createHookWrapper() })

    result.current.verifyOtp({ email: EMAIL, code: '000000' })

    await waitFor(() => {
      expect(result.current.verifyError?.message).toBe('Invalid or expired code')
    })
    expect(result.current.verifyError?.code).toBe('UNAUTHORIZED')
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('starts authenticated when a session is already persisted', () => {
    seedSession()

    const { result } = renderHook(() => useAuth(), { wrapper: createHookWrapper() })

    expect(result.current.isAuthenticated).toBe(true)
  })

  it('drops the session on logout', async () => {
    seedSession()
    const { result } = renderHook(() => useAuth(), { wrapper: createHookWrapper() })

    result.current.logout()

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(false)
    })
    expect(result.current.user).toBeNull()
  })
})
