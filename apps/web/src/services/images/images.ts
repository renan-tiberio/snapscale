import { http } from '../http'

import type { Image, ProcessedImage, ProcessImageParams } from '@snapscale/shared'

type ListImagesParams = { albumId: string }

/** `GET /images?albumId=` */
export const listImages = async ({ albumId }: ListImagesParams): Promise<Image[]> => {
  const { data } = await http.get<Image[]>({ url: '/images', config: { params: { albumId } } })

  return data
}

type UploadImageParams = { formData: FormData }

/** `POST /images` — multipart body carrying `file` and `albumId`. */
export const uploadImage = async ({ formData }: UploadImageParams): Promise<Image> => {
  const { data } = await http.post<Image>({ url: '/images', data: formData })

  return data
}

/** `POST /images/process` — the heavy synchronous route of phase 1. */
export const processImage = async (params: ProcessImageParams): Promise<ProcessedImage> => {
  const { data } = await http.post<ProcessedImage>({ url: '/images/process', data: params })

  return data
}
