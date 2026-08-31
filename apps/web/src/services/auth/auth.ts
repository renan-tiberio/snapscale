import { http } from '../http'

import type {
  FileTokenResponse,
  RequestOtpInput,
  SessionResponse,
  VerifyOtpInput,
} from '@snapscale/shared'

/** `POST /auth/otp/request` — always succeeds, never leaks whether the email exists. */
export const requestOtp = async (input: RequestOtpInput): Promise<{ requested: boolean }> => {
  const { data } = await http.post<{ requested: boolean }>({
    url: '/auth/otp/request',
    data: input,
  })

  return data
}

/** `POST /auth/otp/verify` — exchanges the one-time code for a session. */
export const verifyOtp = async (input: VerifyOtpInput): Promise<SessionResponse> => {
  const { data } = await http.post<SessionResponse>({ url: '/auth/otp/verify', data: input })

  return data
}

/**
 * `GET /auth/file-token` — exchanges the session for a short-lived,
 * `scope: 'file'` token meant only for `<img src>` / `?token=` use
 * (`utils/imageUrls`). Never use the session token itself there.
 */
export const getFileToken = async (): Promise<FileTokenResponse> => {
  const { data } = await http.get<FileTokenResponse>({ url: '/auth/file-token' })

  return data
}
