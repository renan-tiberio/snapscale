import { http } from './http'

import type { Album, CreateAlbumInput, UpdateAlbumInput } from '@snapscale/shared'

/** `GET /albums` */
export async function listAlbums(): Promise<Album[]> {
  const { data } = await http.get<Album[]>('/albums')

  return data
}

/** `POST /albums` */
export async function createAlbum(input: CreateAlbumInput): Promise<Album> {
  const { data } = await http.post<Album>('/albums', input)

  return data
}

/** `PATCH /albums/:id` */
export async function updateAlbum(id: string, input: UpdateAlbumInput): Promise<Album> {
  const { data } = await http.patch<Album>(`/albums/${id}`, input)

  return data
}

/** `DELETE /albums/:id` — answers `{}`, so the deleted id is what callers get back. */
export async function deleteAlbum(id: string): Promise<string> {
  await http.delete(`/albums/${id}`)

  return id
}
