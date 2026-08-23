import { z } from 'zod'

/** `filter` values accepted by `POST /images/process`. */
export const IMAGE_FILTERS = ['none', 'grayscale', 'blur', 'sharpen'] as const
export type ImageFilter = (typeof IMAGE_FILTERS)[number]

/**
 * Processing options — the shape persisted as `processed_images.params` jsonb
 * (`docs/03-technical-design.md` §6) and embedded in the process request below.
 */
export const imageProcessOptionsSchema = z.object({
  width: z.number().int().min(16).max(4096),
  height: z.number().int().min(16).max(4096),
  filter: z.enum(IMAGE_FILTERS),
  quality: z.number().int().min(1).max(100).default(80),
})
export type ImageProcessOptions = z.infer<typeof imageProcessOptionsSchema>

/** `POST /images/process` body: `{ imageId, width, height, filter, quality? }`. */
export const processImageParamsSchema = imageProcessOptionsSchema.extend({
  imageId: z.string().uuid(),
})
export type ProcessImageParams = z.infer<typeof processImageParamsSchema>

/** `POST /images/process` success data. */
export const processedImageSchema = z.object({
  id: z.string().uuid(),
  imageId: z.string().uuid(),
  params: imageProcessOptionsSchema,
  storagePath: z.string().min(1),
  durationMs: z.number().nonnegative(),
  createdAt: z.string().datetime(),
})
export type ProcessedImage = z.infer<typeof processedImageSchema>
