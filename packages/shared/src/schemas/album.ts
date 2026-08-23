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

/**
 * `GET /albums?page&limit` (docs/03 §4). The cap is the point: without an
 * upper bound on `limit`, one request can ask the api to serialize every
 * album a user owns. Out-of-range values are rejected rather than clamped —
 * a silently ignored `limit=1000` looks to the caller like the api only has
 * 100 albums.
 */
export const DEFAULT_ALBUM_PAGE_SIZE = 20
export const MAX_ALBUM_PAGE_SIZE = 100

export const listAlbumsQuerySchema = z.object({
  // `z.coerce`: query-string values always arrive as strings.
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_ALBUM_PAGE_SIZE).default(DEFAULT_ALBUM_PAGE_SIZE),
})
export type ListAlbumsQuery = z.infer<typeof listAlbumsQuerySchema>

/** `PATCH /albums/:id` body — every field optional. */
export const updateAlbumSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
})
export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>
