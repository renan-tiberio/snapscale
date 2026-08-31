import type { Image } from '@snapscale/shared'

export type ImageCardProcessRequest = { imageId: string }

export type ImageCardProps = {
  image: Image
  /**
   * Absolute URL of the original file, served by the api — `null` while
   * `useFileToken` (`hooks/queries/useFileToken.ts`) has no live token yet,
   * which renders a loading placeholder instead of a tokenless `<img>` that
   * would 401.
   */
  src: string | null
  onProcess: (request: ImageCardProcessRequest) => void
  isSelected?: boolean
  /**
   * Called when the `<img>` fails to load (e.g. a 401 from an expired
   * token) and again if the user retries — the caller should refresh the
   * file token so the next attempt has a live one.
   */
  onImageError?: () => void
}
