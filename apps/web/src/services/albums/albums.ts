import { http } from '../http'

import type { Album, CreateAlbumInput, UpdateAlbumInput } from '@snapscale/shared'

/** `GET /albums` */
export const listAlbums = async (): Promise<Album[]> => {
  const { data } = await http.get<Album[]>({ url: '/albums' })

  return data
}

/** `POST /albums` */
export const createAlbum = async (input: CreateAlbumInput): Promise<Album> => {
  const { data } = await http.post<Album>({ url: '/albums', data: input })

  return data
}

type UpdateAlbumParams = { id: string; input: UpdateAlbumInput }

/** `PATCH /albums/:id` */
export const updateAlbum = async ({ id, input }: UpdateAlbumParams): Promise<Album> => {
  const { data } = await http.patch<Album>({ url: `/albums/${id}`, data: input })

  return data
}

type DeleteAlbumParams = { id: string }

/** `DELETE /albums/:id` — answers `{}`, so the deleted id is what callers get back. */
export const deleteAlbum = async ({ id }: DeleteAlbumParams): Promise<string> => {
  await http.delete({ url: `/albums/${id}` })

  return id
}
