import { z } from 'zod'

import { OTP_CODE_LENGTH, OTP_CODE_PATTERN, emailSchema } from '../value-object-rules.js'

export const userSchema = z.object({
  id: z.string().uuid(),
  email: emailSchema,
  createdAt: z.string().datetime(),
})
export type User = z.infer<typeof userSchema>

export const requestOtpSchema = z.object({
  email: emailSchema,
})
export type RequestOtpInput = z.infer<typeof requestOtpSchema>

export const verifyOtpSchema = z.object({
  email: emailSchema,
  code: z.string().regex(OTP_CODE_PATTERN, `Code must be exactly ${OTP_CODE_LENGTH} digits`),
})
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>

export const sessionResponseSchema = z.object({
  token: z.string().min(1),
  user: userSchema,
})
export type SessionResponse = z.infer<typeof sessionResponseSchema>

// Wrapped rather than returning the user bare so the payload can grow (session
// metadata, entitlements) without breaking the client's `data.user` read.
export const meResponseSchema = z.object({
  user: userSchema,
})
export type MeResponse = z.infer<typeof meResponseSchema>

// Carries the short-lived, file-scoped token for `<img src>` / `?token=` use —
// never the session token.
export const fileTokenResponseSchema = z.object({
  token: z.string().min(1),
})
export type FileTokenResponse = z.infer<typeof fileTokenResponseSchema>
