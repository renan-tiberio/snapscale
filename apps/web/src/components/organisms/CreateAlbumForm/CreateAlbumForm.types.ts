import type { CreateAlbumInput } from '@snapscale/shared'

export type CreateAlbumFormProps = {
  onCreate: (input: CreateAlbumInput) => void
  isCreating?: boolean
  errorMessage?: string | null
}
