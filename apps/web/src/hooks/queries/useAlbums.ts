import type { ApiError } from '@/services/http'
import type { Album, CreateAlbumInput, UpdateAlbumInput } from '@snapscale/shared'

export const albumsQueryKey = ['albums'] as const

export interface UseAlbumsResult {
  albums: Album[]
  isLoading: boolean
  error: ApiError | null
  createAlbum: (input: CreateAlbumInput) => void
  isCreating: boolean
  createError: ApiError | null
  updateAlbum: (args: { id: string; input: UpdateAlbumInput }) => void
  isUpdating: boolean
  deleteAlbum: (id: string) => void
  isDeleting: boolean
}

export function useAlbums(): UseAlbumsResult {
  return {
    albums: [],
    isLoading: false,
    error: null,
    createAlbum: () => undefined,
    isCreating: false,
    createError: null,
    updateAlbum: () => undefined,
    isUpdating: false,
    deleteAlbum: () => undefined,
    isDeleting: false,
  }
}
