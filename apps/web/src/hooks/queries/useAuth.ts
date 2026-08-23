import type { ApiError } from '@/services/http'
import type { User, VerifyOtpInput } from '@snapscale/shared'

export interface UseAuthResult {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  requestOtp: (email: string) => void
  isRequestingOtp: boolean
  isOtpRequested: boolean
  requestOtpError: ApiError | null
  verifyOtp: (input: VerifyOtpInput) => void
  isVerifying: boolean
  verifyError: ApiError | null
  resetOtpRequest: () => void
  logout: () => void
}

export function useAuth(): UseAuthResult {
  return {
    user: {
      id: '00000000-0000-4000-8000-000000000000',
      email: 'stub@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    token: 'stub-token',
    isAuthenticated: true,
    requestOtp: () => undefined,
    isRequestingOtp: false,
    isOtpRequested: false,
    requestOtpError: null,
    verifyOtp: () => undefined,
    isVerifying: false,
    verifyError: null,
    resetOtpRequest: () => undefined,
    logout: () => undefined,
  }
}
