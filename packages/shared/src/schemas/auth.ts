import { z } from 'zod'

/** Authenticated user, as returned by `/auth/otp/verify` and `/auth/me`. */
export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
})
export type User = z.infer<typeof userSchema>

/** `POST /auth/otp/request` body. */
export const requestOtpSchema = z.object({
  email: z.string().email(),
})
export type RequestOtpInput = z.infer<typeof requestOtpSchema>

/** `POST /auth/otp/verify` body — code is always exactly 6 digits. */
export const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, 'Code must be exactly 6 digits'),
})
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>

/** `POST /auth/otp/verify` success data: `{ token, user }`. */
export const sessionResponseSchema = z.object({
  token: z.string().min(1),
  user: userSchema,
})
export type SessionResponse = z.infer<typeof sessionResponseSchema>

/**
 * `GET /auth/file-token` success data: `{ token }` — a 60s, `scope: 'file'`
 * token for `<img src>` / `?token=` use, never the 1h session token (see
 * `plugins/auth-guard.ts` and `docs/03-technical-design.md` §4).
 */
export const fileTokenResponseSchema = z.object({
  token: z.string().min(1),
})
export type FileTokenResponse = z.infer<typeof fileTokenResponseSchema>
