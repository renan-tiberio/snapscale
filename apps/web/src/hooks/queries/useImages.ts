import type { ApiError } from '@/services/http'
import type { Image } from '@snapscale/shared'

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

export function useImages(_albumId: string): UseImagesResult {
  return {
    images: [
      {
        id: '00000000-0000-4000-8000-000000000000',
        albumId: '00000000-0000-4000-8000-000000000000',
        ownerId: '00000000-0000-4000-8000-000000000000',
        originalFilename: 'stub.png',
        storagePath: 'originals/stub.png',
        mimeType: 'image/png',
        sizeBytes: 1,
        width: 1,
        height: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    isLoading: false,
    error: null,
    uploadImage: () => undefined,
    isUploading: false,
    uploadError: null,
  }
}
