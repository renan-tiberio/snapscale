import type { CreateAlbumInput } from '@snapscale/shared'

export interface CreateAlbumFormProps {
  onCreate: (input: CreateAlbumInput) => void
  isCreating?: boolean
  errorMessage?: string | null
}
