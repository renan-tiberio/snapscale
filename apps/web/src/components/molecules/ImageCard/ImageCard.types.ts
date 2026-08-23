import type { Image } from '@snapscale/shared'

export interface ImageCardProps {
  image: Image
  /** Absolute URL of the original file, served by the api. */
  src: string
  onProcess: (imageId: string) => void
  isSelected?: boolean
}
