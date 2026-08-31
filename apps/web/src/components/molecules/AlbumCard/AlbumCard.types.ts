import type { Album } from '@snapscale/shared'

export type AlbumCardDeleteRequest = { albumId: string }

export type AlbumCardProps = {
  album: Album
  /** Route the card title links to, e.g. `/albums/:id`. */
  href: string
  onDelete: (request: AlbumCardDeleteRequest) => void
  isDeleting?: boolean
}
