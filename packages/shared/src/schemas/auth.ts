// STUB (RED phase) — permissive placeholders, filled in during the GREEN implementation.
import { z } from 'zod'

export const userSchema = z.any()
export type User = z.infer<typeof userSchema>

export const requestOtpSchema = z.any()
export type RequestOtpInput = z.infer<typeof requestOtpSchema>

export const verifyOtpSchema = z.any()
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>

export const sessionResponseSchema = z.any()
export type SessionResponse = z.infer<typeof sessionResponseSchema>
