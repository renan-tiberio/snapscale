import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'


import type { ApiError } from '@/services/http'
import type { Image } from '@snapscale/shared'

import { listImages, uploadImage } from '@/services/images'

/** Declared once: `all` is the prefix every image query shares. */
export const imagesQueryKeys = {
  all: ['images'] as const,
  byAlbum: (albumId: string) => ['images', albumId] as const,
}

export interface UseImagesResult {
  images: Image[]
  isLoading: boolean
  error: ApiError | null
  uploadImage: (file: File) => void
  isUploading: boolean
  uploadError: ApiError | null
}

/** The image domain hook: the album gallery plus the upload that refreshes it. */
export function useImages(albumId: string): UseImagesResult {
  const queryClient = useQueryClient()

  const imagesQuery = useQuery<Image[], ApiError>({
    queryKey: imagesQueryKeys.byAlbum(albumId),
    queryFn: () => listImages(albumId),
    enabled: albumId !== '',
  })

  const uploadMutation = useMutation<Image, ApiError, File>({
    mutationFn: (file) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('albumId', albumId)

      return uploadImage(formData)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: imagesQueryKeys.byAlbum(albumId) }),
  })

  return {
    images: imagesQuery.data ?? [],
    isLoading: imagesQuery.isLoading,
    error: imagesQuery.error,
    uploadImage: uploadMutation.mutate,
    isUploading: uploadMutation.isPending,
    uploadError: uploadMutation.error,
  }
}
