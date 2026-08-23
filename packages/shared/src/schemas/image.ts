// STUB (RED phase) — permissive placeholders, filled in during the GREEN implementation.
import { z } from 'zod'

export const MAX_UPLOAD_BYTES = Number.MAX_SAFE_INTEGER
export const ALLOWED_IMAGE_MIME_TYPES = [] as const

export const imageSchema = z.any()
export type Image = z.infer<typeof imageSchema>

export const imageUploadConstraintsSchema = z.any()
export type ImageUploadConstraints = z.infer<typeof imageUploadConstraintsSchema>
