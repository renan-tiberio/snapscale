import { http } from './http'

import type { FileTokenResponse, RequestOtpInput, SessionResponse, VerifyOtpInput } from '@snapscale/shared'

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

/**
 * `GET /auth/file-token` — exchanges the session for a 60s, `scope: 'file'`
 * token meant only for `<img src>` / `?token=` use (`utils/imageUrls.ts`).
 * Never use the session token itself there — see `hooks/queries/useFileToken.ts`.
 */
export async function getFileToken(): Promise<FileTokenResponse> {
  const { data } = await http.get<FileTokenResponse>('/auth/file-token')

  return data
}
