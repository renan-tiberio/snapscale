import { z } from 'zod'

const BYTES_PER_KIB = 1024
const MAX_UPLOAD_MIB = 10

export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MIB * BYTES_PER_KIB * BYTES_PER_KIB

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number]

export const imageUploadConstraintsSchema = z.object({
  mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
})
export type ImageUploadConstraints = z.infer<typeof imageUploadConstraintsSchema>

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
