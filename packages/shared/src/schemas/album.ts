// STUB (RED phase) — permissive placeholders, filled in during the GREEN implementation.
import { z } from 'zod'

export const albumSchema = z.any()
export type Album = z.infer<typeof albumSchema>

export const createAlbumSchema = z.any()
export type CreateAlbumInput = z.infer<typeof createAlbumSchema>

export const updateAlbumSchema = z.any()
export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>
