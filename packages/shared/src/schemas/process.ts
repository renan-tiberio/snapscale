// STUB (RED phase) — permissive placeholders, filled in during the GREEN implementation.
import { z } from 'zod'

export const processImageParamsSchema = z.any()
export type ProcessImageParams = z.infer<typeof processImageParamsSchema>

export const processedImageSchema = z.any()
export type ProcessedImage = z.infer<typeof processedImageSchema>
