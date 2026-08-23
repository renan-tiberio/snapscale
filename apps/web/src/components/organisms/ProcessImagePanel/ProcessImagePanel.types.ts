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
  /**
   * Called when the result `<img>` fails to load (e.g. a 401 from an
   * expired file token) and again if the user retries — the caller should
   * refresh the file token so the next attempt has a live one.
   */
  onImageError?: () => void
}
