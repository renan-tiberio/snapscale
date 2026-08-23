import { http } from './http'

import type { RequestOtpInput, SessionResponse, VerifyOtpInput } from '@snapscale/shared'

/** `POST /auth/otp/request` — always succeeds, never leaks whether the email exists. */
export async function requestOtp(input: RequestOtpInput): Promise<{ requested: boolean }> {
  const { data } = await http.post<{ requested: boolean }>('/auth/otp/request', input)

  return data
}

/** `POST /auth/otp/verify` — exchanges the 6-digit code for a session. */
export async function verifyOtp(input: VerifyOtpInput): Promise<SessionResponse> {
  const { data } = await http.post<SessionResponse>('/auth/otp/verify', input)

  return data
}
