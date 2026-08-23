import type { RequestOtpInput, SessionResponse, VerifyOtpInput } from '@snapscale/shared'

export async function requestOtp(_input: RequestOtpInput): Promise<{ requested: boolean }> {
  return Promise.resolve({ requested: false })
}

export async function verifyOtp(_input: VerifyOtpInput): Promise<SessionResponse> {
  return Promise.reject(new Error('not implemented'))
}
