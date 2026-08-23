import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'


import type { ApiError } from '@/services/http'
import type { Album, CreateAlbumInput, UpdateAlbumInput } from '@snapscale/shared'

import { createAlbum, deleteAlbum, listAlbums, updateAlbum } from '@/services/albums'

/** Declared once — every album query and invalidation in the app uses it. */
export const albumsQueryKey = ['albums'] as const

export interface UpdateAlbumArgs {
  id: string
  input: UpdateAlbumInput
}

export interface UseAlbumsResult {
  albums: Album[]
  isLoading: boolean
  error: ApiError | null
  createAlbum: (input: CreateAlbumInput) => void
  isCreating: boolean
  createError: ApiError | null
  updateAlbum: (args: UpdateAlbumArgs) => void
  isUpdating: boolean
  updateError: ApiError | null
  deleteAlbum: (id: string) => void
  /** The id of the album currently being deleted, or `null` when no delete is in flight. */
  deletingAlbumId: string | null
  deleteError: ApiError | null
}

/** The album domain hook: the list query plus every mutation that invalidates it. */
export function useAlbums(): UseAlbumsResult {
  const queryClient = useQueryClient()

  function invalidateAlbums() {
    return queryClient.invalidateQueries({ queryKey: albumsQueryKey })
  }

  const albumsQuery = useQuery<Album[], ApiError>({
    queryKey: albumsQueryKey,
    queryFn: listAlbums,
  })

  const createMutation = useMutation<Album, ApiError, CreateAlbumInput>({
    mutationFn: createAlbum,
    onSuccess: invalidateAlbums,
  })

  const updateMutation = useMutation<Album, ApiError, UpdateAlbumArgs>({
    mutationFn: ({ id, input }) => updateAlbum(id, input),
    onSuccess: invalidateAlbums,
  })

  const deleteMutation = useMutation<string, ApiError, string>({
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
    deletingAlbumId: deleteMutation.isPending ? deleteMutation.variables ?? null : null,
    deleteError: deleteMutation.error,
  }
}
