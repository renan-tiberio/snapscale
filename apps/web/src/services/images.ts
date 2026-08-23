import { http } from './http'

import type { Image, ProcessedImage, ProcessImageParams } from '@snapscale/shared'

/** `GET /images?albumId=` */
export async function listImages(albumId: string): Promise<Image[]> {
  const { data } = await http.get<Image[]>('/images', { params: { albumId } })

  return data
}

/** `POST /images` — multipart body carrying `file` and `albumId`. */
export async function uploadImage(formData: FormData): Promise<Image> {
  const { data } = await http.post<Image>('/images', formData)

  return data
}

/** `POST /images/process` — the heavy synchronous route of phase 1. */
export async function processImage(params: ProcessImageParams): Promise<ProcessedImage> {
  const { data } = await http.post<ProcessedImage>('/images/process', params)

  return data
}
