import type { ImageProcessOptions } from '@snapscale/shared'

export interface ProcessImagePanelProps {
  /** Filename of the image being processed — shown in the panel heading. */
  imageName: string
  onProcess: (options: ImageProcessOptions) => void
  onClose: () => void
  isProcessing?: boolean
  errorMessage?: string | null
  /** Absolute URL of the processed result, once the API returned one. */
  resultUrl?: string | null
}
