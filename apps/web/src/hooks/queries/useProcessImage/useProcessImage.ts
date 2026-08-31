import { useMutation, useQueryClient } from '@tanstack/react-query'

import { imagesQueryKeys } from '../useImages'

import type { ApiError } from '@/services/http'
import type { ProcessedImage, ProcessImageParams } from '@snapscale/shared'

import { processImage } from '@/services/images'

export type UseProcessImageResult = {
  processImage: (params: ProcessImageParams) => void
  processedImage: ProcessedImage | null
  isProcessing: boolean
  processError: ApiError | null
  reset: () => void
}

/**
 * The processing domain hook. A successful run changes what the gallery should
 * show, so it invalidates every image query (the `['images']` prefix).
 */
export const useProcessImage = (): UseProcessImageResult => {
  const queryClient = useQueryClient()

  const processMutation = useMutation<ProcessedImage, ApiError, ProcessImageParams>({
    mutationFn: processImage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: imagesQueryKeys.all }),
  })

  return {
    processImage: processMutation.mutate,
    processedImage: processMutation.data ?? null,
    isProcessing: processMutation.isPending,
    processError: processMutation.error,
    reset: processMutation.reset,
  }
}
