import type { ApiError } from '@/services/http'
import type { ProcessedImage, ProcessImageParams } from '@snapscale/shared'

export interface UseProcessImageResult {
  processImage: (params: ProcessImageParams) => void
  processedImage: ProcessedImage | null
  isProcessing: boolean
  processError: ApiError | null
  reset: () => void
}

export function useProcessImage(): UseProcessImageResult {
  return {
    processImage: () => undefined,
    processedImage: null,
    isProcessing: false,
    processError: null,
    reset: () => undefined,
  }
}
