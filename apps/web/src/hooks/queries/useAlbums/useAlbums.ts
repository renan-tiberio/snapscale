import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { ApiError } from '@/services/http'
import type { Album, CreateAlbumInput, UpdateAlbumInput } from '@snapscale/shared'

import { createAlbum, deleteAlbum, listAlbums, updateAlbum } from '@/services/albums'

/** Declared once — every album query and invalidation in the app uses it. */
export const albumsQueryKey = ['albums'] as const

export type UpdateAlbumArgs = {
  id: string
  input: UpdateAlbumInput
}

export type DeleteAlbumArgs = {
  id: string
}

export type UseAlbumsResult = {
  albums: Album[]
  isLoading: boolean
  error: ApiError | null
  createAlbum: (input: CreateAlbumInput) => void
  isCreating: boolean
  createError: ApiError | null
  updateAlbum: (args: UpdateAlbumArgs) => void
  isUpdating: boolean
  updateError: ApiError | null
  deleteAlbum: (args: DeleteAlbumArgs) => void
  /** The id of the album currently being deleted, or `null` when no delete is in flight. */
  deletingAlbumId: string | null
  deleteError: ApiError | null
}

/** The album domain hook: the list query plus every mutation that invalidates it. */
export const useAlbums = (): UseAlbumsResult => {
  const queryClient = useQueryClient()

  const invalidateAlbums = () => queryClient.invalidateQueries({ queryKey: albumsQueryKey })

  const albumsQuery = useQuery<Album[], ApiError>({
    queryKey: albumsQueryKey,
    queryFn: listAlbums,
  })

  const createMutation = useMutation<Album, ApiError, CreateAlbumInput>({
    mutationFn: createAlbum,
    onSuccess: invalidateAlbums,
  })

  const updateMutation = useMutation<Album, ApiError, UpdateAlbumArgs>({
    mutationFn: updateAlbum,
    onSuccess: invalidateAlbums,
  })

  const deleteMutation = useMutation<string, ApiError, DeleteAlbumArgs>({
    mutationFn: deleteAlbum,
    onSuccess: invalidateAlbums,
  })

  return {
    albums: albumsQuery.data ?? [],
    isLoading: albumsQuery.isLoading,
    error: albumsQuery.error,
    createAlbum: createMutation.mutate,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    updateAlbum: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    deleteAlbum: deleteMutation.mutate,
    deletingAlbumId: deleteMutation.isPending ? (deleteMutation.variables?.id ?? null) : null,
    deleteError: deleteMutation.error,
  }
}
