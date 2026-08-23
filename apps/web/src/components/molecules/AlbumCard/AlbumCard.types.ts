import type { Album } from '@snapscale/shared'

export interface AlbumCardProps {
  album: Album
  /** Route the card title links to, e.g. `/albums/:id`. */
  href: string
  onDelete: (albumId: string) => void
  isDeleting?: boolean
}
