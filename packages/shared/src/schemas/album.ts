import { z } from 'zod'

/** Album entity, as stored/returned by the api service. */
export const albumSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Album = z.infer<typeof albumSchema>

/** `POST /albums` body. */
export const createAlbumSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
})
export type CreateAlbumInput = z.infer<typeof createAlbumSchema>

/** `PATCH /albums/:id` body — every field optional. */
export const updateAlbumSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
})
export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>
