import { z } from 'zod'

export const IMAGE_FILTERS = ['none', 'grayscale', 'blur', 'sharpen'] as const
export type ImageFilter = (typeof IMAGE_FILTERS)[number]

export const MIN_PROCESS_DIMENSION_PX = 16
export const MAX_PROCESS_DIMENSION_PX = 4096
export const MIN_PROCESS_QUALITY = 1
export const MAX_PROCESS_QUALITY = 100
export const DEFAULT_PROCESS_QUALITY = 80

// Persisted verbatim as the `processed_images.params` jsonb column — reshaping
// this is a data migration, not a refactor.
export const imageProcessOptionsSchema = z.object({
  width: z.number().int().min(MIN_PROCESS_DIMENSION_PX).max(MAX_PROCESS_DIMENSION_PX),
  height: z.number().int().min(MIN_PROCESS_DIMENSION_PX).max(MAX_PROCESS_DIMENSION_PX),
  filter: z.enum(IMAGE_FILTERS),
  quality: z
    .number()
    .int()
    .min(MIN_PROCESS_QUALITY)
    .max(MAX_PROCESS_QUALITY)
    .default(DEFAULT_PROCESS_QUALITY),
})
export type ImageProcessOptions = z.infer<typeof imageProcessOptionsSchema>

export const processImageParamsSchema = imageProcessOptionsSchema.extend({
  imageId: z.string().uuid(),
})
export type ProcessImageParams = z.infer<typeof processImageParamsSchema>

export const processedImageSchema = z.object({
  id: z.string().uuid(),
  imageId: z.string().uuid(),
  params: imageProcessOptionsSchema,
  storagePath: z.string().min(1),
  durationMs: z.number().nonnegative(),
  createdAt: z.string().datetime(),
})
export type ProcessedImage = z.infer<typeof processedImageSchema>
