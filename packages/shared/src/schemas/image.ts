import { z } from 'zod'

/** Upload constraints from `docs/03-technical-design.md` §7: max 10MB, jpeg/png/webp only. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number]

/** Validates the multipart metadata (mime type + size) before the file is persisted. */
export const imageUploadConstraintsSchema = z.object({
  mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
})
export type ImageUploadConstraints = z.infer<typeof imageUploadConstraintsSchema>

/** Image entity, as stored/returned by the api service. */
export const imageSchema = z.object({
  id: z.string().uuid(),
  albumId: z.string().uuid(),
  ownerId: z.string().uuid(),
  originalFilename: z.string().min(1),
  storagePath: z.string().min(1),
  mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Image = z.infer<typeof imageSchema>
