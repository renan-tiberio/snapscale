import type { Album, CreateAlbumInput, UpdateAlbumInput } from '@snapscale/shared'

export async function listAlbums(): Promise<Album[]> {
  return Promise.resolve([])
}

export async function createAlbum(_input: CreateAlbumInput): Promise<Album> {
  return Promise.reject(new Error('not implemented'))
}

export async function updateAlbum(_id: string, _input: UpdateAlbumInput): Promise<Album> {
  return Promise.reject(new Error('not implemented'))
}

export async function deleteAlbum(_id: string): Promise<void> {
  return Promise.reject(new Error('not implemented'))
}
