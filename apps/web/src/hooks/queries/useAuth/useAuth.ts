import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { ApiError } from '@/services/http'
import type { RequestOtpInput, SessionResponse, User, VerifyOtpInput } from '@snapscale/shared'

import { useAuthContext } from '@/context/AuthContext'
import { requestOtp, verifyOtp } from '@/services/auth'

export type UseAuthResult = {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  requestOtp: (input: RequestOtpInput) => void
  isRequestingOtp: boolean
  isOtpRequested: boolean
  requestOtpError: ApiError | null
  verifyOtp: (input: VerifyOtpInput) => void
  isVerifying: boolean
  verifyError: ApiError | null
  resetOtpRequest: () => void
  logout: () => void
}

/**
 * The auth domain hook: OTP request, OTP verification and the session state
 * they produce. Pages never call the auth service directly.
 */
export const useAuth = (): UseAuthResult => {
  const { user, token, isAuthenticated, login, logout } = useAuthContext()
  const queryClient = useQueryClient()

  const requestOtpMutation = useMutation<{ requested: boolean }, ApiError, RequestOtpInput>({
    mutationFn: requestOtp,
  })

  const verifyOtpMutation = useMutation<SessionResponse, ApiError, VerifyOtpInput>({
    mutationFn: verifyOtp,
    onSuccess: (session) => {
      login(session)
      queryClient.clear()
    },
  })

  return {
    user,
    token,
    isAuthenticated,
    requestOtp: requestOtpMutation.mutate,
    isRequestingOtp: requestOtpMutation.isPending,
    isOtpRequested: requestOtpMutation.isSuccess,
    requestOtpError: requestOtpMutation.error,
    verifyOtp: verifyOtpMutation.mutate,
    isVerifying: verifyOtpMutation.isPending,
    verifyError: verifyOtpMutation.error,
    resetOtpRequest: requestOtpMutation.reset,
    logout: () => {
      logout()
      queryClient.clear()
    },
  }
}
