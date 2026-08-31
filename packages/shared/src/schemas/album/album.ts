import { z } from 'zod'

export const MAX_ALBUM_NAME_LENGTH = 120
export const MAX_ALBUM_DESCRIPTION_LENGTH = 2000
export const DEFAULT_ALBUM_PAGE_SIZE = 20

// Out-of-range values are rejected rather than clamped: a silently ignored
// `limit=1000` looks to the caller like the account only has 100 albums.
export const MAX_ALBUM_PAGE_SIZE = 100

export const albumSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(MAX_ALBUM_NAME_LENGTH),
  description: z.string().max(MAX_ALBUM_DESCRIPTION_LENGTH).nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Album = z.infer<typeof albumSchema>

export const createAlbumSchema = z.object({
  name: z.string().min(1).max(MAX_ALBUM_NAME_LENGTH),
  description: z.string().max(MAX_ALBUM_DESCRIPTION_LENGTH).optional(),
})
export type CreateAlbumInput = z.infer<typeof createAlbumSchema>

export const listAlbumsQuerySchema = z.object({
  // `z.coerce`: query-string values always arrive as strings.
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_ALBUM_PAGE_SIZE).default(DEFAULT_ALBUM_PAGE_SIZE),
})
export type ListAlbumsQuery = z.infer<typeof listAlbumsQuerySchema>

export const updateAlbumSchema = z.object({
  name: z.string().min(1).max(MAX_ALBUM_NAME_LENGTH).optional(),
  description: z.string().max(MAX_ALBUM_DESCRIPTION_LENGTH).optional(),
})
export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>
